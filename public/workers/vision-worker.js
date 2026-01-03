/* Puzzle Finder Vision Worker (Step 9)
 * Classic worker (not module) to allow importScripts() for OpenCV Emscripten bundle.
 * Receives RGBA frame buffers (processed / downscaled) and runs CV pipeline off the main thread.
 */
/* eslint-disable no-restricted-globals */
let __baseUrl = '/';
let __cvPromise = null;

// For a tiny motion heuristic in live mode.
let __prevGraySmall = null;

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}
let __cvModule = null;
let __preloadError = null;

function __sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ensureOpenCV() {
  if (__cvModule) return __cvModule;
  if (__cvPromise) return __cvPromise;

  function waitForModuleReady(mod, timeoutMs) {
    // Emscripten OpenCV may initialize asynchronously; `Mat` becomes available after runtime init.
    if (mod && mod.Mat) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let done = false;
      const finishOk = () => {
        if (done) return;
        done = true;
        clearTimeout(t);
        resolve();
      };
      const finishErr = (err) => {
        if (done) return;
        done = true;
        clearTimeout(t);
        reject(err);
      };

      const t = setTimeout(() => {
        finishErr(new Error('OpenCV runtime init timeout.'));
      }, timeoutMs);

      try {
        // If already initialized, resolve quickly.
        if (mod && mod.Mat) return finishOk();

        // Emscripten calls this when ready.
        if (mod) {
          mod.onRuntimeInitialized = () => finishOk();
          // If OpenCV aborts, surface it.
          mod.onAbort = (what) => finishErr(new Error('OpenCV abort: ' + what));
        }

        // Fallback: poll for Mat in case runtime init happened before we set the callback.
        (async () => {
          const start = Date.now();
          while (!done && Date.now() - start < timeoutMs) {
            if (mod && mod.Mat) return finishOk();
            await __sleep(50);
          }
          if (!done) finishErr(new Error('OpenCV runtime init timeout.'));
        })();
      } catch (e) {
        finishErr(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  __cvPromise = (async () => {
    try {
	    // Some OpenCV builds rely on a global `Module` object for configuration.
	    // Provide locateFile so any additional assets (e.g. wasm) resolve under our base URL.
	    self.Module = self.Module || {};
	    if (!self.Module.locateFile) {
	      self.Module.locateFile = (path) => __baseUrl + 'vendor/opencv/' + path;
	    }

	    // Load opencv.js as a plain script (copied into /public/vendor/opencv/opencv.js by prebuild).
      importScripts(__baseUrl + 'vendor/opencv/opencv.js');
    } catch (e) {
      throw new Error('Failed to importScripts(OpenCV): ' + (e && e.message ? e.message : String(e)));
    }

    // OpenCV Emscripten bundle typically exposes a factory function as global `cv`.
    // Calling it returns a Module object that initializes asynchronously.
    const cvAny = self.cv;

    // Many OpenCV Emscripten builds set `self.cv` to a Promise that resolves to the module.
    // In that case, await it and then replace the global with the resolved module.
    if (cvAny && typeof cvAny.then === 'function') {
      const mod = await cvAny;
      await waitForModuleReady(mod, 60000);
      if (!mod || !mod.Mat) {
        throw new Error('OpenCV runtime initialized, but module API (cv.Mat) was not found.');
      }
      __cvModule = mod;
      self.cv = mod;
      return mod;
    }

    if (typeof cvAny === 'function' && !cvAny.Mat) {
      let mod;
      try {
	      mod = cvAny({
	        locateFile: (path) => __baseUrl + 'vendor/opencv/' + path
	      });
      } catch (e) {
        throw new Error('OpenCV factory threw: ' + (e && e.message ? e.message : String(e)));
      }

      // Some builds return a Promise. Others return a Module object immediately.
      if (mod && typeof mod.then === 'function') {
        mod = await mod;
      }

      // Wait for runtime init so Mat/etc exist.
      await waitForModuleReady(mod, 60000);

      if (mod && mod.Mat) {
        __cvModule = mod;
        self.cv = mod; // normalize: after init, treat global `cv` as module object
        return __cvModule;
      }
      throw new Error('OpenCV factory did not produce a usable module.');
    }

    // Non-modularized builds: poll for global cv readiness (may still take time).
    const start = Date.now();
    while (Date.now() - start < 60000) {
      const cv = self.cv;
      if (cv && cv.Mat) {
        __cvModule = cv;
        return __cvModule;
      }
      await __sleep(50);
    }
    throw new Error('OpenCV load timeout (cv not available).');
  })();

  return __cvPromise;
}

function toMatOfPoint(cv, pts) {
  const mat = new cv.Mat(pts.length, 1, cv.CV_32SC2);
  for (let i = 0; i < pts.length; i++) {
    mat.intPtr(i, 0)[0] = Math.round(pts[i].x);
    mat.intPtr(i, 0)[1] = Math.round(pts[i].y);
  }
  return mat;
}

function segmentPiecesFromRgba(cv, imageData, sourceW, sourceH, scaleToSource, options) {
  const targetMinAreaRatio = options?.minAreaRatio ?? 0.002;
  const blurK = Math.max(1, options?.blurKernelSize ?? 5);
  const blurKOdd = blurK % 2 === 0 ? blurK + 1 : blurK;
  const morphK = Math.max(1, options?.morphKernelSize ?? 5);
  const morphKOdd = morphK % 2 === 0 ? morphK + 1 : morphK;

  const procW = imageData.width;
  const procH = imageData.height;

  const src = cv.matFromImageData(imageData); // RGBA
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const binary = new cv.Mat();
  const kernel = new cv.Mat();
  const tmp = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  let inverted = false;

  const pieces = [];
  let contoursFound = 0;

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(blurKOdd, blurKOdd), 0, 0, cv.BORDER_DEFAULT);

    cv.threshold(blurred, binary, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);

    const nonZero = cv.countNonZero(binary);
    const total = binary.rows * binary.cols;
    if (nonZero > total * 0.5) {
      cv.bitwise_not(binary, binary);
      inverted = true;
    }

    kernel.create(morphKOdd, morphKOdd, cv.CV_8U);
    kernel.setTo(new cv.Scalar(1));

    cv.morphologyEx(binary, tmp, cv.MORPH_CLOSE, kernel);
    cv.morphologyEx(tmp, binary, cv.MORPH_OPEN, kernel);

    // Quality metrics (cheap heuristics)
    let quality;
    try {
      const meanMat = new cv.Mat();
      const stdMat = new cv.Mat();
      cv.meanStdDev(gray, meanMat, stdMat);
      const mean = meanMat.data64F ? meanMat.data64F[0] : meanMat.data32F[0];
      const std = stdMat.data64F ? stdMat.data64F[0] : stdMat.data32F[0];

      // Laplacian variance for blur estimate
      const lap = new cv.Mat();
      cv.Laplacian(gray, lap, cv.CV_64F, 1, 1, 0, cv.BORDER_DEFAULT);
      const lapMean = new cv.Mat();
      const lapStd = new cv.Mat();
      cv.meanStdDev(lap, lapMean, lapStd);
      const lapStdV = lapStd.data64F ? lapStd.data64F[0] : lapStd.data32F[0];
      const lapVar = lapStdV * lapStdV;

      // Foreground coverage
      const fg = clamp01(cv.countNonZero(binary) / (binary.rows * binary.cols));

      // Motion estimate (mean abs diff against previous small gray)
      let motion;
      try {
        const targetW = 160;
        const scale = gray.cols > targetW ? targetW / gray.cols : 1;
        const w = Math.max(1, Math.round(gray.cols * scale));
        const h = Math.max(1, Math.round(gray.rows * scale));
        const small = new cv.Mat();
        cv.resize(gray, small, new cv.Size(w, h), 0, 0, cv.INTER_AREA);
        if (__prevGraySmall) {
          const diff = new cv.Mat();
          cv.absdiff(small, __prevGraySmall, diff);
          const dm = new cv.Mat();
          const ds = new cv.Mat();
          cv.meanStdDev(diff, dm, ds);
          motion = dm.data64F ? dm.data64F[0] : dm.data32F[0];
          diff.delete();
          dm.delete();
          ds.delete();
        }
        if (__prevGraySmall) __prevGraySmall.delete();
        __prevGraySmall = small;
      } catch {
        // ignore motion errors
      }

      quality = {
        width: procW,
        height: procH,
        mean: Number(mean),
        std: Number(std),
        lapVar: Number(lapVar),
        foregroundRatio: Number(fg),
        motion: motion == null ? undefined : Number(motion)
      };

      meanMat.delete();
      stdMat.delete();
      lap.delete();
      lapMean.delete();
      lapStd.delete();
    } catch {
      // ignore quality errors
    }

    cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    contoursFound = contours.size();

    const minArea = procW * procH * targetMinAreaRatio;

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area < minArea) continue;

      const peri = cv.arcLength(cnt, true);
      const approx = new cv.Mat();
      try {
        cv.approxPolyDP(cnt, approx, 0.01 * peri, true);
        const useCnt = approx.total && approx.total() >= 3 ? approx : cnt;
        const rect = cv.boundingRect(useCnt);

        const pts = [];
        const n = useCnt.rows;
        for (let j = 0; j < n; j++) {
          const x = useCnt.intPtr(j, 0)[0];
          const y = useCnt.intPtr(j, 0)[1];
          // Map to SOURCE coordinates.
          pts.push({ x: x * scaleToSource, y: y * scaleToSource });
        }

        pieces.push({
          id: pieces.length + 1,
          areaPx: Math.round(area * scaleToSource * scaleToSource),
          bbox: {
            x: rect.x * scaleToSource,
            y: rect.y * scaleToSource,
            width: rect.width * scaleToSource,
            height: rect.height * scaleToSource
          },
          contour: pts
        });
      } finally {
        approx.delete();
      }
    }

    return {
      pieces,
      quality,
      debug: {
        sourceWidth: sourceW,
        sourceHeight: sourceH,
        processedWidth: procW,
        processedHeight: procH,
        scaleToSource,
        inverted,
        threshold: 'otsu',
        piecesKept: pieces.length,
        contoursFound
      }
    };
  } finally {
    src.delete();
    gray.delete();
    blurred.delete();
    binary.delete();
    kernel.delete();
    tmp.delete();
    contours.delete();
    hierarchy.delete();
  }
}

function filterAndExtractPiecesCore(cv, imageData, segmentation, options) {
  const borderMarginPx = options?.borderMarginPx ?? 6;
  const paddingPx = options?.paddingPx ?? 6;
  const minSolidity = options?.minSolidity ?? 0.80;
  const maxAspectRatio = options?.maxAspectRatio ?? 4.0;
  const maxPieces = options?.maxPieces ?? 200;

  const procW = segmentation.debug.processedWidth;
  const procH = segmentation.debug.processedHeight;
  const scaleToSource = segmentation.debug.scaleToSource;

  const extracted = [];
  let candidates = 0, filteredBorder = 0, filteredAspect = 0, filteredSolidity = 0;

  // We need processed frame as Mat for some ops.
  const src = cv.matFromImageData(imageData); // RGBA
  const gray = new cv.Mat();
  const edges = new cv.Mat();
  const cntMat = new cv.Mat();
  const hull = new cv.Mat();
  const approx = new cv.Mat();

  try {
    for (const cand of segmentation.pieces) {
      if (extracted.length >= maxPieces) break;
      candidates++;

      const ptsProc = cand.contour.map((p) => ({ x: p.x / scaleToSource, y: p.y / scaleToSource }));
      if (ptsProc.length < 3) continue;

      const cnt = toMatOfPoint(cv, ptsProc);
      try {
        const peri = cv.arcLength(cnt, true);
        cv.approxPolyDP(cnt, approx, 0.005 * peri, true);
        const useCnt = approx.total && approx.total() >= 3 ? approx : cnt;

        const rect = cv.boundingRect(useCnt);
        const aspect = rect.width > 0 && rect.height > 0 ? Math.max(rect.width / rect.height, rect.height / rect.width) : 999;

        if (
          rect.x < borderMarginPx ||
          rect.y < borderMarginPx ||
          rect.x + rect.width > procW - borderMarginPx ||
          rect.y + rect.height > procH - borderMarginPx
        ) {
          filteredBorder++;
          continue;
        }
        if (aspect > maxAspectRatio) {
          filteredAspect++;
          continue;
        }

        cv.convexHull(useCnt, hull, false, true);
        const area = cv.contourArea(useCnt);
        const hullArea = cv.contourArea(hull);
        const solidity = hullArea > 0 ? area / hullArea : 0;

        if (solidity < minSolidity) {
          filteredSolidity++;
          continue;
        }

        // Build contour arrays
        const contourProcessed = [];
        const n = useCnt.rows;
        for (let i = 0; i < n; i++) {
          contourProcessed.push({ x: useCnt.intPtr(i, 0)[0], y: useCnt.intPtr(i, 0)[1] });
        }
        const contourSource = contourProcessed.map((p) => ({ x: p.x * scaleToSource, y: p.y * scaleToSource }));

        // Expand ROI with padding (processed coords)
        const rx = Math.max(0, rect.x - paddingPx);
        const ry = Math.max(0, rect.y - paddingPx);
        const rw = Math.min(procW - rx, rect.width + paddingPx * 2);
        const rh = Math.min(procH - ry, rect.height + paddingPx * 2);

        extracted.push({
          id: extracted.length + 1,
          bboxSource: { x: rx * scaleToSource, y: ry * scaleToSource, width: rw * scaleToSource, height: rh * scaleToSource },
          bboxProcessed: { x: rx, y: ry, width: rw, height: rh },
          areaPxProcessed: Math.round(area),
          solidity,
          aspectRatio: aspect,
          previewUrl: '', // main thread will generate
          contourSource,
          contourProcessed
        });
      } finally {
        cnt.delete();
      }
    }

    const debug =
      `Candidates: ${candidates}\n` +
      `Rejected(border): ${filteredBorder}\n` +
      `Rejected(aspect): ${filteredAspect}\n` +
      `Rejected(solidity): ${filteredSolidity}\n` +
      `Kept: ${extracted.length}\n` +
      `Max pieces: ${maxPieces}`;

    return { pieces: extracted, debug };
  } finally {
    src.delete();
    gray.delete();
    edges.delete();
    cntMat.delete();
    hull.delete();
    approx.delete();
  }
}

function classifyEdgeCornerMvpCore(cv, imageData, pieces, options) {
  const borderTol = options?.borderTolerancePx ?? 6;
  const angleTol = options?.angleToleranceDeg ?? 20;
  const minLenRatio = options?.minLineLengthRatio ?? 0.35;
  const houghThreshold = options?.houghThreshold ?? 30;

  // We operate in processed coordinates.
  const procW = imageData.width;
  const procH = imageData.height;

  const src = cv.matFromImageData(imageData); // RGBA
  const gray = new cv.Mat();
  const edges = new cv.Mat();
  const lines = new cv.Mat();

  let corners = 0, edgesCount = 0, interiors = 0;

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    const updated = pieces.map((p) => {
      const roi = p.bboxProcessed;
      const rx = Math.max(0, Math.floor(roi.x));
      const ry = Math.max(0, Math.floor(roi.y));
      const rw = Math.min(procW - rx, Math.floor(roi.width));
      const rh = Math.min(procH - ry, Math.floor(roi.height));
      if (rw <= 5 || rh <= 5) {
        interiors++;
        return { ...p, classification: 'interior', classificationDebug: 'ROI too small.' };
      }

      // Crop ROI
      const rect = new cv.Rect(rx, ry, rw, rh);
      const grayRoi = gray.roi(rect);

      try {
        cv.Canny(grayRoi, edges, 60, 120, 3, false);

        // Hough lines on edges
        cv.HoughLinesP(edges, lines, 1, Math.PI / 180, houghThreshold, Math.round(Math.min(rw, rh) * minLenRatio), 10);

        let bestH = 0;
        let bestV = 0;

        for (let i = 0; i < lines.rows; i++) {
          const x1 = lines.intPtr(i, 0)[0];
          const y1 = lines.intPtr(i, 0)[1];
          const x2 = lines.intPtr(i, 0)[2];
          const y2 = lines.intPtr(i, 0)[3];
          const dx = x2 - x1;
          const dy = y2 - y1;
          const len = Math.hypot(dx, dy);
          if (len < Math.min(rw, rh) * minLenRatio) continue;

          const ang = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
          // Normalize to [0,90]
          const angN = ang > 90 ? 180 - ang : ang;

          const nearH = angN <= angleTol;
          const nearV = Math.abs(angN - 90) <= angleTol;

          // Check if line lies near ROI border (outer boundary)
          const nearLeft = x1 < borderTol && x2 < borderTol;
          const nearRight = x1 > rw - borderTol && x2 > rw - borderTol;
          const nearTop = y1 < borderTol && y2 < borderTol;
          const nearBottom = y1 > rh - borderTol && y2 > rh - borderTol;

          if (nearH && (nearTop || nearBottom)) bestH = Math.max(bestH, len);
          if (nearV && (nearLeft || nearRight)) bestV = Math.max(bestV, len);
        }

        const hasH = bestH >= Math.min(rw, rh) * minLenRatio;
        const hasV = bestV >= Math.min(rw, rh) * minLenRatio;

        let cls = 'interior';
        if (hasH && hasV) cls = 'corner';
        else if (hasH || hasV) cls = 'edge';

        if (cls === 'corner') corners++;
        else if (cls === 'edge') edgesCount++;
        else interiors++;

        return {
          ...p,
          classification: cls,
          classificationDebug: `H:${hasH ? 'Y' : 'N'}(${bestH.toFixed(0)}) V:${hasV ? 'Y' : 'N'}(${bestV.toFixed(0)})`
        };
      } finally {
        grayRoi.delete();
        lines.delete(); // reset lines mat each piece
        lines.create(0,0,cv.CV_32SC4);
      }
    });

    return { pieces: updated, debug: `Corners: ${corners}, Edges: ${edgesCount}, Interiors: ${interiors}` };
  } finally {
    src.delete();
    gray.delete();
    edges.delete();
    lines.delete();
  }
}

self.onmessage = async (event) => {
  const msg = event.data || {};
  const type = msg.type;

  try {
    if (type === 'init') {
    // baseUrl is required so the worker can resolve opencv.js regardless of app BASE_URL.
    const provided = msg && typeof msg.baseUrl === 'string' ? msg.baseUrl : null;

    if (provided) {
      __baseUrl = provided.endsWith('/') ? provided : provided + '/';
    } else {
      // Derive from our own URL: .../workers/vision-worker.js -> .../
      const href = String(self.location && self.location.href ? self.location.href : '');
      const idx = href.lastIndexOf('/workers/');
      if (idx >= 0) __baseUrl = href.slice(0, idx + 1);
      else __baseUrl = href.replace(/\/workers\/[^/]+$/, '/');
      if (!__baseUrl.endsWith('/')) __baseUrl += '/';
    }

    // Respond immediately to avoid blocking on large OpenCV download/compile.
    self.postMessage({ type: 'inited' });

    // Preload OpenCV asynchronously (best effort). This may take time on first load.
    setTimeout(() => {
      ensureOpenCV().catch((e) => {
        __preloadError = String(e && e.message ? e.message : e);
      });
    }, 0);

    return;
  }

    if (type === 'process') {
      const requestId = msg.requestId;
      const pipeline = msg.pipeline || 'segment';
      const width = msg.width;
      const height = msg.height;
      const sourceWidth = msg.sourceWidth;
      const sourceHeight = msg.sourceHeight;
      const scaleToSource = msg.scaleToSource || (sourceWidth && width ? sourceWidth / width : 1);

      const buffer = msg.buffer;
      const u8 = new Uint8ClampedArray(buffer);
      const imageData = new ImageData(u8, width, height);

      const cv = await ensureOpenCV();

      const segOptions = msg.segOptions || {};
      const extractOptions = msg.extractOptions || {};
      const classifyOptions = msg.classifyOptions || {};

      const segmentation = segmentPiecesFromRgba(cv, imageData, sourceWidth, sourceHeight, scaleToSource, segOptions);

      if (pipeline === 'segment') {
        self.postMessage({ type: 'result', requestId, segmentation });
        return;
      }

      const extracted = filterAndExtractPiecesCore(cv, imageData, segmentation, extractOptions);

      if (pipeline === 'extract') {
        self.postMessage({ type: 'result', requestId, segmentation, extracted });
        return;
      }

      const classified = classifyEdgeCornerMvpCore(cv, imageData, extracted.pieces, classifyOptions);

      self.postMessage({ type: 'result', requestId, segmentation, extracted, classified });
      return;
    }
  } catch (e) {
    const err = e && e.message ? e.message : String(e);
    self.postMessage({ type: 'error', requestId: msg.requestId, error: err });
  }
};
