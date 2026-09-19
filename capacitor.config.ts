import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.laboratoriovillar.gastrosmart',
  appName: 'GastroSmart',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true
  },
  plugins: {
    // Add plugins config here if needed
  }
};

export default config;
