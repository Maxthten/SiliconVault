export const app = {
  isPackaged: false,
  getAppPath: () => process.env.SILICONVAULT_TEST_APP_PATH || process.cwd(),
  getPath: () => process.cwd()
}
