/* The program's own variables: the tree that is there from the start, above the Menu, and that a .config shadows.

       .config
         .integer_precision            a whole number; nothing reads it yet
         .colors
           Shapes                      the colours shapes are drawn in
             .tensor_default  .data-in
             .variable_colors          the colours a newly named shape takes one of at random: six rows, a colour each
           UI                          the colours of the canvas and what is written on it
             .bg .panel .hover .focus  .fg .line .fade-to .dot  .muted .measure_bar .warn .select

   Each variable: name; key, the name as it is matched (lower case, no dot, - for _ and for spaces); css, the theme
   variable a colour sets (a colour is three entries: red, green, blue); cssRows, for an array of colours, the theme
   variable each row sets; value, what a variable that is not a colour starts as; rows, how many rows its shape has; branch, the group of .colors it belongs to; at, where it sits in the default layout, in units; cols,
   how many entries wide its shape is; color, the theme colour a variable that is not a colour is drawn in. */
const colour = (name, css, branch, at) => ({ name, key: name.slice(1).replace(/_/g, '-'), css, branch, at, cols: 3 });
export const SYSTEM = [
  { name: '.integer_precision', key: 'integer-precision', value: [32], branch: null, at: [2, 1], cols: 1, color: 'watermelon' },
  colour('.tensor_default', 'tensor', 'Shapes', [2, 6]), colour('.data-in', 'data-in', 'Shapes', [2, 8]),
  { name: '.variable_colors', key: 'variable-colors', cssRows: ['lavender', 'watermelon', 'lazuli', 'fanta', 'marigold', 'lagoon'], branch: 'Shapes', at: [14, 6], cols: 3, rows: 6, color: 'lavender' },
  colour('.bg', 'bg', 'UI', [2, 16]), colour('.panel', 'panel', 'UI', [12, 16]), colour('.hover', 'hover', 'UI', [22, 16]), colour('.focus', 'focus', 'UI', [32, 16]),
  colour('.fg', 'fg', 'UI', [2, 18]), colour('.line', 'line', 'UI', [12, 18]), colour('.fade-to', 'fade-to', 'UI', [22, 18]), colour('.dot', 'dot', 'UI', [32, 18]),
  colour('.muted', 'muted', 'UI', [2, 20]), colour('.measure_bar', 'measure', 'UI', [12, 20]), colour('.warn', 'warn', 'UI', [22, 20]), colour('.select', 'select', 'UI', [32, 20]),
];
export const CONFIG = '.config', COLORS = '.colors';
/* a name as it is matched against the keys above: ".Data in" and "--data_in" are both "data-in" */
export const leaf = name => name.replace(/^\s*\/\/\s*/, '').trim().toLowerCase().replace(/^(--|\.)/, '').replace(/[\s_]+/g, '-');
