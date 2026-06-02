import type { UltrastarApi } from "../shared/ipc-contract.ts";

declare global {
  interface Window {
    ultrastar: UltrastarApi;
  }
}
