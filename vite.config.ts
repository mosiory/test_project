import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // جلوگیری از سرو شدن داده، سورس بک‌اند و فایل‌های حساس حتی در حالت توسعه
      fs: {
        deny: [
          '.env',
          '.env.*',
          '**/.env',
          '**/.env.*',
          '*.pem',
          '**/*.pem',
          '**/.git/**',
          '**/data/**',
          '**/server/**',
          'server.ts',
          '**/server.ts',
          '**/scripts/**',
          '**/*.db',
          '**/*.db-wal',
          '**/*.db-shm',
          '**/.session-secret',
          '**/package.json',
          '**/package-lock.json',
          '**/tsconfig.json',
          'package.json',
          'package-lock.json',
          'tsconfig.json',
          'vite.config.ts',
        ],
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr:
        process.env.DISABLE_HMR === 'true'
          ? false
          : {
              // پورت غیرمعمول برای جلوگیری از تداخل با نمونه‌های در حال اجرا
              port: Number(process.env.HMR_PORT || 24691),
            },
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
