import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Build tentap's web editor FROM SOURCE: its prebuilt bundle inlines an old
      // prosemirror-view that redraws mid-composition and duplicates text (quirk 9).
      '@10play/tentap-editor/web': resolve(
        __dirname,
        'node_modules/@10play/tentap-editor/src/webEditorUtils/index.ts',
      ),
    },
    // One copy of everything the editor's identity checks depend on.
    dedupe: [
      'react',
      'react-dom',
      '@tiptap/core',
      '@tiptap/pm',
      '@tiptap/react',
      'prosemirror-model',
      'prosemirror-state',
      'prosemirror-transform',
      'prosemirror-view',
    ],
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: 'main.tsx',
      name: 'WebviewEditor',
      formats: ['iife'],
      fileName: () => 'bundle.js',
    },
  },
});
