import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.smartloadtracking.app',
  appName: 'Smart Load Tracking',
  webDir: 'build',
  ios: {
    contentInset: 'always'
  }
};

export default config;
