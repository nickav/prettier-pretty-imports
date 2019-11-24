const {
  parsers: { babel: babelParser },
} = require('prettier/parser-babylon');
const j = require('jscodeshift');

const {
  isExternalModule,
  isScopedExternalModule,
  isInternalModule,
  isLocalModuleFromParentDirectory,
  isLocalModuleCurrentDirectoryIndex,
  isLocalModuleFromSiblingDirectory,
} = require('./matchers');

// Based on https://github.com/bfncs/codemod-imports-sort/

const createComment = (block, width = 80) => [
  ' '.padEnd(width - 1, '-'),
  ` ${block.name} `.padEnd(width - 1, '-'),
];

const getImportBlock = (node) => {
  const { value } = node.source;

  if (isExternalModule(value)) {
    return { name: 'Node Modules', order: 0 };
  }

  return { name: 'Other', order: 1 };
};

const sortBlocks = (blocks) => blocks.slice().sort((a, b) => a.order - b.order);

const sortNodes = (nodes) =>
  nodes.slice().sort((a, b) => a.source.value.localeCompare(b.source.value));

// TODO(nick): allow users to provide their own config
const config = {
  createComment,
  getImportBlock,
  sortBlocks,
  sortNodes,
};

const parsers = {
  babel: {
    ...babelParser,

    parse(text, parsers, options) {
      const ast = babelParser.parse(text, parsers, options);

      const declarations = j(ast).find(j.ImportDeclaration);

      if (!declarations.length) {
        return ast;
      }

      // TODO(nick): join imports from the same paths

      // Get sections
      const blocks = Object.values(
        declarations.nodes().reduce((memo, node) => {
          const block = config.getImportBlock(node);

          if (!memo[block.name])
            memo[block.name] = Object.assign(block, { nodes: [] });

          memo[block.name].nodes.push(node);
          return memo;
        }, {})
      );

      // Sort blocks
      const sortedBlocks = config.sortBlocks(blocks);

      // Sort nodes
      sortedBlocks.forEach((block) => {
        block.nodes = config.sortNodes(block.nodes);
      });

      // Remove previous import comments
      const importComments = declarations
        .nodes()
        .map((node) => node.leadingComments)
        .filter((e) => e)
        .flat(1);

      ast.comments = ast.comments.filter(
        (comment) =>
          !importComments.some(
            (e) => e.start === comment.start && e.end === comment.end
          )
      );

      // Remove old declarations
      declarations.remove();

      // Insert new comment blocks
      const body = ast.program.body;

      sortedBlocks
        .slice()
        .reverse()
        .forEach((block) => {
          const printWidth = options.printWidth || 80;
          block.nodes[0].comments = config
            .createComment(block, printWidth)
            .map((line) => j.commentLine(line));

          block.nodes
            .slice()
            .reverse()
            .forEach((node, i) => {
              body.unshift(node);
            });
          //body.unshift(block.nodes);
        });

      return ast;
    },

    /*
    preprocess(text, options) {
      if (babelParser.preprocess) {
        text = babelParser.preprocess(text, options);
      }

      return text;
    },
    */
  },
};

const printers = {};

module.exports = {
  parsers,
  //printers
};
