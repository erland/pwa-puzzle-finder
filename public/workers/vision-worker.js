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
  const angleTol = options?.angleToleranceDeg ?? 25;
  const minLenRatio = options?.minLineLengthRatio ?? 0.25;
  const houghThreshold = options?.houghThreshold ?? 20;
  const cannyLow = options?.cannyLow ?? 40;
  const cannyHigh = options?.cannyHigh ?? 90;
  const uncertainMarginRatio = options?.uncertainMarginRatio ?? 0.10;

  // Processed-frame dimensions (same coordinate space as bboxProcessed/contourProcessed).
  const procW = imageData.width;
  const procH = imageData.height;

  // Convert processed frame to grayscale once; per-piece work happens on ROI + contour mask.
  const rgba = cv.matFromImageData(imageData);
  const gray = new cv.Mat();

  const safeDelete = (m) => {
    try {
      if (m && (!m.isDeleted || !m.isDeleted())) m.delete();
    } catch {
      // ignore
    }
  };

  let corners = 0, edgesCount = 0, nonEdges = 0, unknowns = 0;

  try {
    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);

    const updated = pieces.map((p) => {
      const roi = p.bboxProcessed;
      const rx = Math.max(0, Math.floor(roi.x));
      const ry = Math.max(0, Math.floor(roi.y));
      const rw = Math.min(procW - rx, Math.floor(roi.width));
      const rh = Math.min(procH - ry, Math.floor(roi.height));

      const contour = p.contourProcessed ?? [];
      if (rw <= 10 || rh <= 10 || contour.length < 3) {
        unknowns++;
        return { ...p, classification: 'unknown', classificationConfidence: 0, classificationDebug: 'Missing contour/ROI too small.' };
      }

      const rect = new cv.Rect(rx, ry, rw, rh);

      // Mats created per-piece (owned here).
      let grayRoi = null;
      let mask = null;
      let cnt = null;
      let contoursVec = null;
      let kernel = null;
      let boundary = null;
      let masked = null;
      let edgesMat = null;
      let boundaryEdges = null;
      let lines = null;

      try {
        // Crop grayscale ROI for the piece bbox
        grayRoi = gray.roi(rect);

        // Build a filled mask from the piece contour (in ROI-local coords)
        mask = new cv.Mat(rh, rw, cv.CV_8UC1, new cv.Scalar(0));
        cnt = new cv.Mat(contour.length, 1, cv.CV_32SC2);
        for (let i = 0; i < contour.length; i++) {
          cnt.intPtr(i, 0)[0] = Math.round(contour[i].x - rx);
          cnt.intPtr(i, 0)[1] = Math.round(contour[i].y - ry);
        }
        contoursVec = new cv.MatVector();
        contoursVec.push_back(cnt);
        cv.drawContours(mask, contoursVec, 0, new cv.Scalar(255), -1);

        // Boundary pixels only (reduces texture/shadow edges inside the piece)
        kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
        boundary = new cv.Mat();
        cv.morphologyEx(mask, boundary, cv.MORPH_GRADIENT, kernel);

        // Edges only where the piece boundary is
        masked = new cv.Mat();
        cv.bitwise_and(grayRoi, grayRoi, masked, mask);

        edgesMat = new cv.Mat();
        cv.Canny(masked, edgesMat, cannyLow, cannyHigh, 3, false);

        boundaryEdges = new cv.Mat();
        cv.bitwise_and(edgesMat, edgesMat, boundaryEdges, boundary);

        // Hough lines on boundary edges
        lines = new cv.Mat();
        const minLineLen = Math.max(12, Math.round(Math.max(rw, rh) * minLenRatio));
        cv.HoughLinesP(boundaryEdges, lines, 1, Math.PI / 180, houghThreshold, minLineLen, 10);

        // Pick the strongest direction, then the strongest ~perpendicular direction.
        let bestLen1 = 0;
        let bestAng1 = null;
        let bestLen2 = 0;

        for (let i = 0; i < lines.rows; i++) {
          const x1 = lines.intPtr(i, 0)[0];
          const y1 = lines.intPtr(i, 0)[1];
          const x2 = lines.intPtr(i, 0)[2];
          const y2 = lines.intPtr(i, 0)[3];
          const dx = x2 - x1;
          const dy = y2 - y1;
          const len = Math.hypot(dx, dy);
          if (len < minLineLen) continue;

          let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
          if (ang < 0) ang += 180;

          if (len > bestLen1) {
            bestLen1 = len;
            bestAng1 = ang;
          }
        }

        if (bestAng1 != null) {
          for (let i = 0; i < lines.rows; i++) {
            const x1 = lines.intPtr(i, 0)[0];
            const y1 = lines.intPtr(i, 0)[1];
            const x2 = lines.intPtr(i, 0)[2];
            const y2 = lines.intPtr(i, 0)[3];
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.hypot(dx, dy);
            if (len < minLineLen) continue;

            let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
            if (ang < 0) ang += 180;

            let diff = Math.abs(ang - bestAng1);
            if (diff > 90) diff = 180 - diff;

            const nearPerp = Math.abs(diff - 90) <= angleTol;
            if (nearPerp && len > bestLen2) {
              bestLen2 = len;
            }
          }
        }

        const maxDim = Math.max(rw, rh);
        const ratio1 = maxDim > 0 ? bestLen1 / maxDim : 0;
        const ratio2 = maxDim > 0 ? bestLen2 / maxDim : 0;

        const sideConf = (ratio) => {
          if (ratio <= 0) return 0;
          const denom = Math.max(1e-6, 1 - minLenRatio);
          return clamp01((ratio - minLenRatio) / denom);
        };

        const conf1 = bestLen1 >= minLineLen ? sideConf(ratio1) : 0;
        const conf2 = bestLen2 >= minLineLen ? sideConf(ratio2) : 0;

        const has1 = bestLen1 >= minLineLen;
        const has2 = bestLen2 >= minLineLen;

        let cls = 'nonEdge';
        let conf = 0.7;

        if (has1 && has2) {
          cls = 'corner';
          conf = Math.min(conf1, conf2);
        } else if (has1) {
          cls = 'edge';
          conf = conf1;
        } else {
          cls = 'nonEdge';
          conf = 0.7;
        }

        const bestRatio = Math.max(ratio1, ratio2);
        const borderline = bestRatio > 0 && bestRatio < minLenRatio * (1 + uncertainMarginRatio);
        if ((cls === 'corner' || cls === 'edge') && borderline) {
          cls = 'unknown';
          conf = Math.max(0.05, Math.min(0.25, conf));
        }

        if (cls === 'corner') corners++;
        else if (cls === 'edge') edgesCount++;
        else if (cls === 'nonEdge') nonEdges++;
        else unknowns++;

        return {
          ...p,
          classification: cls,
          classificationConfidence: conf,
          classificationDebug: `minLine:${minLineLen} L1:${bestLen1.toFixed(0)} L2:${bestLen2.toFixed(0)}`
        };
      } finally {
        safeDelete(lines);
        safeDelete(boundaryEdges);
        safeDelete(edgesMat);
        safeDelete(masked);
        safeDelete(boundary);
        safeDelete(kernel);
        safeDelete(contoursVec);
        safeDelete(cnt);
        safeDelete(mask);
        safeDelete(grayRoi);
      }
    });

    return { pieces: updated, debug: `Corners: ${corners}, Edges: ${edgesCount}, Non-edge: ${nonEdges}, Unknown: ${unknowns}` };
  } finally {
    rgba.delete();
    gray.delete();
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
