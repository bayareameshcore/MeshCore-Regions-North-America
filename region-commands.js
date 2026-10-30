/* MeshCore repeater region commands from a place chain.
   region put / region def match CommonCLI::handleRegionCmd.
   A tag is a second chain under the last root token, not a parent of the state. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RegionCommands = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function placeChain(rootCodes, pathNodes) {
    return rootCodes.concat(pathNodes.map(function (n) { return n.code; }));
  }

  function inheritedTags(pathNodes) {
    var tags = [];
    pathNodes.forEach(function (n) {
      (n.tags || []).forEach(function (t) {
        if (tags.indexOf(t) === -1) tags.push(t);
      });
    });
    return tags;
  }

  function itemsFor(rootCodes, pathNodes, enabledTags, extras) {
    var chain = placeChain(rootCodes, pathNodes);
    var rootTail = rootCodes[rootCodes.length - 1];
    var seen = {};
    var items = [];
    chain.forEach(function (code, i) {
      if (seen[code]) return;
      seen[code] = true;
      items.push({ code: code, parent: i === 0 ? null : chain[i - 1] });
    });
    (enabledTags || []).forEach(function (code) {
      if (seen[code]) return;
      seen[code] = true;
      items.push({ code: code, parent: rootTail });
    });
    (extras || []).forEach(function (extra) {
      if (!extra || seen[extra.code]) return;
      seen[extra.code] = true;
      items.push({ code: extra.code, parent: extra.parent || rootTail });
    });
    return { chain: chain, items: items };
  }

  function defLine(items) {
    var tokens = items.map(function (item, i) {
      if (i === items.length - 1) return item.code;
      var next = items[i + 1];
      if (next.parent === item.code) return item.code;
      return item.code + "|" + (next.parent || "*");
    });
    return "region def " + tokens.join(" ");
  }

  function commandText(items, defaultCode, style) {
    var lines;
    if (style === "put") {
      lines = items.map(function (item) {
        return item.parent
          ? "region put " + item.code + " " + item.parent
          : "region put " + item.code;
      });
    } else {
      lines = [defLine(items)];
    }
    if (defaultCode) lines.push("region default " + defaultCode);
    lines.push("region save");
    return lines.join("\n");
  }

  function build(rootCodes, pathNodes, enabledTags, limits, extras) {
    limits = limits || {};
    var maxLine = limits.maxLineLength || 160;
    var maxNames = limits.maxRegionNames || 32;
    var maxDepth = limits.maxDepth || 8;
    var built = itemsFor(rootCodes, pathNodes, enabledTags, extras);
    var selected = pathNodes.length ? pathNodes[pathNodes.length - 1].code : null;
    var def = defLine(built.items);
    return {
      blocked: pathNodes.some(function (n) { return n.placeholder === true; }),
      names: built.items.map(function (i) { return i.code; }),
      nameCount: built.items.length,
      tooMany: built.items.length > maxNames,
      depth: built.chain.length,
      tooDeep: built.chain.length > maxDepth,
      defLine: def,
      defTooLong: def.length > maxLine,
      defText: commandText(built.items, selected, "def"),
      putText: commandText(built.items, selected, "put"),
      defaultCode: selected
    };
  }

  return {
    placeChain: placeChain,
    inheritedTags: inheritedTags,
    build: build
  };
});
