// Lets the training scripts import the extension's TypeScript sources directly (Node strips the
// types itself). The extension uses extension-less relative imports (bundler style); this resolve
// hook retries them with ".ts". Used via: node --import ./training/scripts/register.mjs <script>
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (error?.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});
