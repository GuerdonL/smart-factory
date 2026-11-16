/* The program's own variables: the tree that is there from the start, above the Menu, and that a .config shadows.

       .config
         .integer_precision            a whole number; nothing reads it yet
         .dark_mode                    0 for the light colours, 1 for the dark ones; left blank, whatever the computer asks for
         .colors
           .shapes                     the colours shapes are drawn in
             .tensor_default  .data-in
             .variable_colors          the colours a newly named shape takes one of at random: six rows, a colour each
           .ui                         the colours of the canvas and what is written on it
             .bg .panel .hover .focus  .fg .line .fade-to .dot  .muted .measure_bar .warn .select
         .dark_colors                  the same two groups again: the colours used while .dark_mode is 1

   No values are written here. What each variable is comes from a project's .config (the default Menu's gives them
   all); where no .config says, a colour falls back on the stylesheet so the page can still be drawn, and a variable
   that is not a colour has no value.

   A .config's reach is the group it is in, or the whole space if it is in none: see "shadowing" in smart-factory.js.

   Each variable: name; key, the name as it is matched (lower case, no dot, - for _ and for spaces); css, the theme
   variable a colour sets (a colour is three entries: red, green, blue); cssRows, for an array of colours, the theme
   variable each row sets (a row no .config gives in full is no colour at all: what wears it is drawn without one); rows, how many rows its shape has; branch, the group of .colors it belongs to; at, where it sits in the default layout, in units; cols,
   how many entries wide its shape is; color, the theme colour a variable that is not a colour is drawn in. */
const colour = (name, css, branch, at) => ({ name, key: name.slice(1).replace(/_/g, '-'), css, branch, at, cols: 3 });
/* the six places a named shape's colour is kept: theme variables --variable-1 to --variable-6, which no stylesheet
   sets. They are the rows of .variable_colors, whatever those come to. OLD is what they were called in projects
   saved before, when each was named for a colour. */
export const SLOTS = ['variable-1', 'variable-2', 'variable-3', 'variable-4', 'variable-5', 'variable-6'];
export const OLD = { lavender: SLOTS[0], watermelon: SLOTS[1], lazuli: SLOTS[2], fanta: SLOTS[3], marigold: SLOTS[4], lagoon: SLOTS[5] };
export const SYSTEM = [
  { name: '.integer_precision', key: 'integer-precision', branch: null, at: [2, 1], cols: 1, color: SLOTS[1] },
  { name: '.dark_mode', key: 'dark-mode', branch: null, at: [12, 1], cols: 1, color: SLOTS[2] },      /* with nothing said, the computer's own setting: see programDefaults */
  colour('.tensor_default', 'tensor', '.shapes', [2, 6]), colour('.data-in', 'data-in', '.shapes', [2, 8]),
  { name: '.variable_colors', key: 'variable-colors', cssRows: SLOTS,
    branch: '.shapes', at: [14, 6], cols: 3, rows: 6, color: SLOTS[0] },
  colour('.bg', 'bg', '.ui', [2, 16]), colour('.panel', 'panel', '.ui', [12, 16]), colour('.hover', 'hover', '.ui', [22, 16]), colour('.focus', 'focus', '.ui', [32, 16]),
  colour('.fg', 'fg', '.ui', [2, 18]), colour('.line', 'line', '.ui', [12, 18]), colour('.fade-to', 'fade-to', '.ui', [22, 18]), colour('.dot', 'dot', '.ui', [32, 18]),
  colour('.muted', 'muted', '.ui', [2, 20]), colour('.measure_bar', 'measure', '.ui', [12, 20]), colour('.warn', 'warn', '.ui', [22, 20]), colour('.select', 'select', '.ui', [32, 20]),
];
export const CONFIG = '.config', COLORS = '.colors', DARK = '.dark_colors';
export const DARK_DOWN = 24;                    /* how far below .colors the same shapes sit in .dark_colors, in the default layout */
export const isColour = v => !!(v.css || v.cssRows);
/* a name as it is matched against the keys above: ".Data in" and "--data_in" are both "data-in" */
export const leaf = name => name.replace(/^\s*\/\/\s*/, '').trim().toLowerCase().replace(/^(--|\.)/, '').replace(/[\s_]+/g, '-');
