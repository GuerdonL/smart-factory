/* The program's own variables: the tree that is there from the start, above the Menu, and that a .config shadows.

       .config
         .integer_precision            a whole number; nothing reads it yet
         .colors
           Shapes                      the colours shapes are drawn in
             .tensor_default  .data-in
           UI                          the colours of the canvas and what is written on it
             .bg .panel .hover .focus  .fg .line .fade-to .dot  .muted .measure_bar .warn .select

   Each variable: name; key, the name as it is matched (lower case, no dot, - for _ and for spaces); css, the theme
   variable a colour sets (a colour is three entries: red, green, blue); value, what a variable that is not a colour
   starts as; branch, the group of .colors it belongs to; at, where it sits in the default layout, in units; cols,
   how many entries wide its shape is; color, the theme colour a variable that is not a colour is drawn in. */
const colour = (name, css, branch, at) => ({ name, key: name.slice(1).replace(/_/g, '-'), css, branch, at, cols: 3 });
export const SYSTEM = [
  { name: '.integer_precision', key: 'integer-precision', value: [32], branch: null, at: [2, 1], cols: 1, color: 'watermelon' },
  colour('.tensor_default', 'tensor', 'Shapes', [2, 6]), colour('.data-in', 'data-in', 'Shapes', [2, 8]),
  colour('.bg', 'bg', 'UI', [2, 12]), colour('.panel', 'panel', 'UI', [6, 12]), colour('.hover', 'hover', 'UI', [10, 12]), colour('.focus', 'focus', 'UI', [14, 12]),
  colour('.fg', 'fg', 'UI', [2, 14]), colour('.line', 'line', 'UI', [6, 14]), colour('.fade-to', 'fade-to', 'UI', [10, 14]), colour('.dot', 'dot', 'UI', [14, 14]),
  colour('.muted', 'muted', 'UI', [2, 16]), colour('.measure_bar', 'measure', 'UI', [6, 16]), colour('.warn', 'warn', 'UI', [10, 16]), colour('.select', 'select', 'UI', [14, 16]),
];
export const CONFIG = '.config', COLORS = '.colors';
/* a name as it is matched against the keys above: ".Data in" and "--data_in" are both "data-in" */
export const leaf = name => name.replace(/^\s*\/\/\s*/, '').trim().toLowerCase().replace(/^(--|\.)/, '').replace(/[\s_]+/g, '-');
