// src/types/vite-env.d.ts
declare module "*.csv?url" {
  const value: string;
  export default value;
}

declare module '*.geojson' {
  const value: any;
  export default value;
}

declare module '*.geojson?url' {
  const src: string; // URL string
  export default src;
}
