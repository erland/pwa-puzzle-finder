declare module 'opencv-js-wasm' {
  const loadOpenCv: () => Promise<any>;
  export default loadOpenCv;
}
