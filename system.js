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
   variable each row sets; value, what a variable starts as when the stylesheet does not say (one that is not a colour,
   or the array of colours); rows, how many rows its shape has; branch, the group of .colors it belongs to; at, where it sits in the default layout, in units; cols,
   how many entries wide its shape is; color, the theme colour a variable that is not a colour is drawn in. */
const colour = (name, css, branch, at) => ({ name, key: name.slice(1).replace(/_/g, '-'), css, branch, at, cols: 3 });
/* the six places a named shape's colour is kept: theme variables --variable-1 to --variable-6, which no stylesheet
   sets. They are the rows of .variable_colors, whatever those come to. OLD is what they were called in projects
   saved before, when each was named for a colour. */
export const SLOTS = ['variable-1', 'variable-2', 'variable-3', 'variable-4', 'variable-5', 'variable-6'];
export const OLD = { lavender: SLOTS[0], watermelon: SLOTS[1], lazuli: SLOTS[2], fanta: SLOTS[3], marigold: SLOTS[4], lagoon: SLOTS[5] };
export const SYSTEM = [
  { name: '.integer_precision', key: 'integer-precision', value: [32], branch: null, at: [2, 1], cols: 1, color: SLOTS[1] },
  colour('.tensor_default', 'tensor', 'Shapes', [2, 6]), colour('.data-in', 'data-in', 'Shapes', [2, 8]),
  { name: '.variable_colors', key: 'variable-colors', cssRows: SLOTS, value: [154, 123, 234, 47, 174, 98, 44, 95, 220, 255, 122, 20, 227, 160, 8, 15, 163, 168],
    branch: 'Shapes', at: [14, 6], cols: 3, rows: 6, color: SLOTS[0] },
  colour('.bg', 'bg', 'UI', [2, 16]), colour('.panel', 'panel', 'UI', [12, 16]), colour('.hover', 'hover', 'UI', [22, 16]), colour('.focus', 'focus', 'UI', [32, 16]),
  colour('.fg', 'fg', 'UI', [2, 18]), colour('.line', 'line', 'UI', [12, 18]), colour('.fade-to', 'fade-to', 'UI', [22, 18]), colour('.dot', 'dot', 'UI', [32, 18]),
  colour('.muted', 'muted', 'UI', [2, 20]), colour('.measure_bar', 'measure', 'UI', [12, 20]), colour('.warn', 'warn', 'UI', [22, 20]), colour('.select', 'select', 'UI', [32, 20]),
];
export const CONFIG = '.config', COLORS = '.colors';
/* a name as it is matched against the keys above: ".Data in" and "--data_in" are both "data-in" */
export const leaf = name => name.replace(/^\s*\/\/\s*/, '').trim().toLowerCase().replace(/^(--|\.)/, '').replace(/[\s_]+/g, '-');
