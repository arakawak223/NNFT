/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** glTF/glb URL for the PLATEAU stadium-area extract. When unset,
   *  the title screen disables the PLATEAU option and the mock
   *  tribune is rendered. */
  readonly VITE_PLATEAU_GLTF_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
