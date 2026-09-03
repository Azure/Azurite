describe("Mocha options fixture", function () {
  it("quoted target", function () {});

  it("unselected failure", function () {
    throw new Error("The quoted grep option did not filter this test");
  });
});
