/** [INV-6-adjacent] RNG determinism: packages/engine must use named seeded streams, never Math.random. */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "disallow Math.random in packages/engine; use a named seeded RNG stream instead",
    },
    schema: [],
    messages: {
      noMathRandom: "Math.random is banned in packages/engine. Use a named seeded RNG stream (Spec §6).",
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        const { object, property } = node;
        if (
          object.type === "Identifier" &&
          object.name === "Math" &&
          property.type === "Identifier" &&
          property.name === "random"
        ) {
          context.report({ node, messageId: "noMathRandom" });
        }
      },
    };
  },
};

export default rule;
