/// <reference types="vite/client" />

declare module '*.wgsl' {
  const src: string;
  export default src;
}

declare module '*.wgsl?raw' {
  const src: string;
  export default src;
}

declare module '*.glsl?raw' {
  const src: string;
  export default src;
}

declare module '*.glsl' {
  const src: string;
  export default src;
}

declare module '*.vert' {
  const src: string;
  export default src;
}

declare module '*.frag' {
  const src: string;
  export default src;
}
