// src/declarations.d.ts
declare module "*.csv" {
  const value: string;
  export default value;
}

declare module "*.geojson" {
  const value: any;
  export default value;
}
