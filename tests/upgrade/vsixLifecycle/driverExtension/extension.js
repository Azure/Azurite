function activate() {
  // No-op: this extension exists solely to provide an Extension Host entry
  // point for driving the real, separately-installed Azurite extension.
}

function deactivate() {}

module.exports = { activate, deactivate };
