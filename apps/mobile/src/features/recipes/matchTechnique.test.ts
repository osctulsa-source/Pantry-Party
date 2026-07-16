import { matchTechnique, resolveStepGlyph } from './matchTechnique';

describe('matchTechnique', () => {
  it('matches core technique verbs', () => {
    expect(matchTechnique('Dice the onion into small, even pieces.')).toBe('chop');
    expect(matchTechnique('Whisk the eggs until frothy.')).toBe('stir');
    expect(matchTechnique('Bring to a boil, then simmer for 10 minutes.')).toBe('simmer');
    expect(matchTechnique('Sear the chicken thighs skin-side down.')).toBe('flip');
    expect(matchTechnique('Knead the dough for 8 minutes.')).toBe('knead');
    expect(matchTechnique('Season generously with salt and pepper.')).toBe('season');
    expect(matchTechnique('Drain the pasta, reserving a cup of water.')).toBe('pour');
    expect(matchTechnique('Grate the parmesan over the top.')).toBe('grate');
    expect(matchTechnique('Roll out the dough on a floured surface.')).toBe('roll');
    expect(matchTechnique('Let it rest for 5 minutes before slicing?')).toBe('rest');
    expect(matchTechnique('Preheat the oven to 400 degrees.')).toBe('preheat');
    expect(matchTechnique('Mash the potatoes until smooth.')).toBe('mash');
  });

  it('is case-insensitive', () => {
    expect(matchTechnique('DICE THE ONION.')).toBe('chop');
  });

  it('ignores negated clauses', () => {
    expect(matchTechnique('Do not stir while the caramel forms.')).toBe(null);
    expect(matchTechnique("Don't flip until the edges are set. Cook 3 minutes.")).toBe(null);
  });

  it('a negation only kills its own clause, not the sentence after it', () => {
    expect(matchTechnique('Do not stir. Simmer gently for 20 minutes.')).toBe('simmer');
  });

  it('rule order wins over text position', () => {
    // 'roll' outranks 'chop' in the rule list even though "cut" appears first.
    expect(matchTechnique('Cut the dough in half, then roll out each piece.')).toBe('roll');
    // 'preheat' outranks 'flip' — "bake until browned" is an oven step.
    expect(matchTechnique('Bake until browned, about 25 minutes.')).toBe('preheat');
  });

  it('returns null when nothing matches', () => {
    expect(matchTechnique('Transfer to a serving plate.')).toBe(null);
    expect(matchTechnique('')).toBe(null);
  });
});

describe('resolveStepGlyph', () => {
  const total = 6;

  it('authored technique beats the matcher', () => {
    expect(resolveStepGlyph('knead', 'Stir everything together.', 2, total)).toBe('knead');
  });

  it('authored "none" suppresses the matcher and falls to stage', () => {
    expect(resolveStepGlyph('none', 'Stir everything together.', 2, total)).toBe('cooking');
  });

  it('bogus authored value falls through to the matcher', () => {
    expect(resolveStepGlyph('zzz-not-real', 'Stir everything together.', 2, total)).toBe('stir');
  });

  it('no authored value uses the matcher', () => {
    expect(resolveStepGlyph(null, 'Dice the onion.', 2, total)).toBe('chop');
  });

  it('stage fallback: first step is prep, last is finishing, middle is cooking', () => {
    expect(resolveStepGlyph(null, 'Get everything ready.', 0, total)).toBe('prep');
    expect(resolveStepGlyph(null, 'Enjoy while warm.', total - 1, total)).toBe('finishing');
    expect(resolveStepGlyph(null, 'Wait for the magic.', 3, total)).toBe('cooking');
  });

  it('a single-step recipe falls back to prep', () => {
    expect(resolveStepGlyph(null, 'Assemble everything.', 0, 1)).toBe('prep');
  });
});
