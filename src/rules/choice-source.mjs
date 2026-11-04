// These exact predecessor blobs differ from the reviewed catalog only in their
// player-facing description. Compare the current hash as well so a later
// mechanical change cannot silently extend this compatibility.
const previousDescriptionHashes = {
  "design/cards/a-roof-before-nightfall.md": [
    "eb44c9d35fc124de0086ef05cf874d8e7c7af53479c122ca060825fadfd6ccbc",
    "b7ae4c32558ddf36cbdf426d84f533e258d8ccbdcbf2d286e2f88579c17b1cae",
  ],
  "design/cards/bottled-morning.md": [
    "cf8a9606edf0192d0781c822aad5c513f284f893b2665d493e43fae7fbe5d2e9",
    "fbf08f8bb887f47c479a2de0642545d5939d12dcc0b4e75b7465737b0a7fec7a",
  ],
  "design/cards/enchanting-workshop.md": [
    "3f3423064cf33bbd413c708a68fcccf18ba6dcf30e67044d8c7334f1e11032fc",
    "ab740cc923183d39e24934d31423d96c27e1eb776b6e9901d37cfb25f591f101",
  ],
  "design/cards/make-something-useful.md": [
    "19d2e162057b97dbb0504cbecd0f04f1a51f64243df25b385a6f39f9ce11bceb",
    "efaa6827edb495bc73a74c4ab498b02e9c6b1dbaf135deb3238e19df5e84ec7b",
  ],
  "design/cards/smoke-in-a-bottle.md": [
    "91600100d2cc2de15df640d1cddf32dcb05759fdabf26114fca79b5942e34bca",
    "cb89f6e60fbcde3c57cc52168cc3b2b0b447cdb4367516b44a195ab10803e12c",
  ],
  "design/cards/the-cleverest-mixture.md": [
    "62c2dd46ff78b76bff69dfab5524f6bd9c9f55a069763a4def6c558ce271e89c",
    "cf27c29b4b6c1d3c6d32fc06337008668a554b3537c371f9dca74ef08b54cb4e",
  ],
  "design/cards/trail-workshop.md": [
    "51a77a8c96e50bd4ea58a2afb6902e352a57d24e1603c2bf4c305d1bbc678b3c",
    "ad6d4e4a1026f5b0d273f133845419e0a16734a5e97d703551737c8558e52e8e",
  ],
  "design/cards/use-a-healing-potion.md": [
    "210f6e2c84a51dd31f6b44a534f602e703b137eec38cef08697a63d1fdec82ea",
    "b6d2a008edf658fa5ab0cb06dd591e47973106d3ca65348613cc2110c3321a44",
  ],
};

export function choiceSourceMatches(actual, current) {
  if (!current?.path || !current.sha256 || actual?.path !== current.path) return false;
  if (actual.sha256 === current.sha256) return true;
  const pair = previousDescriptionHashes[current.path];
  return pair?.[0] === actual.sha256 && pair[1] === current.sha256;
}
