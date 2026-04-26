/**
 * Custom Webpack loader for @spz-loader/core
 *
 * The @spz-loader/core package embeds its WASM binary as a template literal
 * string using legacy octal escape sequences (e.g., `\0asm\1\0\0\0...`).
 *
 * In ES2018+ strict mode, octal escape sequences inside template literals are
 * a SyntaxError. Browsers parsing the bundled chunk throw:
 *   "SyntaxError: Octal escape sequences are not allowed in template strings"
 *
 * This loader rewrites template literals containing `\0asm` (the WASM magic
 * bytes) by converting them to String.raw`` tagged template literals, which
 * suppress the illegal escape sequence restriction (ES2018 spec, 12.3.8.5).
 *
 * Transformation: `...wasm bytes...` → String.raw`...wasm bytes...`
 */

module.exports = function spzWasmLoader(source) {
  // Only transform files that have the problematic pattern
  if (!source.includes('\\0asm')) return source;

  // Replace template literals containing WASM magic bytes with String.raw`` form.
  // String.raw`` tagged templates bypass the legacy octal escape restriction.
  // We do a simple stateful scan to find backtick-delimited spans.
  let result = '';
  let i = 0;

  while (i < source.length) {
    const backtickIdx = source.indexOf('`', i);

    if (backtickIdx === -1) {
      result += source.slice(i);
      break;
    }

    // Append everything up to the opening backtick
    result += source.slice(i, backtickIdx);

    // Find the matching closing backtick (skip escaped chars)
    let end = backtickIdx + 1;
    while (end < source.length) {
      if (source[end] === '\\') {
        end += 2; // skip escaped character
        continue;
      }
      if (source[end] === '`') break;
      // Template expressions ${...} — skip past them
      if (source[end] === '$' && source[end + 1] === '{') {
        let depth = 1;
        end += 2;
        while (end < source.length && depth > 0) {
          if (source[end] === '{') depth++;
          else if (source[end] === '}') depth--;
          end++;
        }
        continue;
      }
      end++;
    }

    const templateContent = source.slice(backtickIdx + 1, end);

    if (templateContent.includes('\\0asm')) {
      // Tag with String.raw to allow legacy escape sequences in template strings
      result += 'String.raw`' + templateContent + '`';
    } else {
      result += '`' + templateContent + '`';
    }

    i = end + 1; // move past closing backtick
  }

  return result;
};
