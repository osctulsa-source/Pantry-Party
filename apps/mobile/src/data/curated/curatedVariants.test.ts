import type { CookingDevice } from '@breadbox/core';

import {
  getDeviceVariants,
  parseVariants,
  pickDefaultDevice,
  type DeviceVariant,
} from './curatedVariants';

const goodStep = {
  number: 1,
  step: 'Cover and cook on low until tender, about 6 hours.',
  ingredients: ['beef broth'],
  equipment: ['slow cooker'],
  lengthMinutes: 360,
};

const goodVariant = {
  recipeId: 9000001,
  device: 'crockpot',
  readyInMinutes: 380,
  steps: [goodStep],
};

describe('parseVariants', () => {
  it('indexes valid entries by recipeId', () => {
    const map = parseVariants([goodVariant, { ...goodVariant, device: 'instantpot' }]);
    expect(map.get(9000001)).toHaveLength(2);
  });

  it('drops malformed entries without throwing', () => {
    const map = parseVariants([
      goodVariant,
      null,
      'nonsense',
      { ...goodVariant, device: 'hologram' },           // unknown device
      { ...goodVariant, recipeId: 'nine million' },      // bad id
      { ...goodVariant, readyInMinutes: null },          // bad time
      { ...goodVariant, steps: [] },                     // no steps
      { ...goodVariant, steps: [{ ...goodStep, step: 42 }] }, // bad step text
    ]);
    expect(map.get(9000001)).toHaveLength(1);
  });

  it('returns an empty map for non-array input', () => {
    expect(parseVariants(undefined).size).toBe(0);
    expect(parseVariants({}).size).toBe(0);
  });
});

describe('getDeviceVariants', () => {
  it('returns [] for unknown ids (bundled dataset lookup)', () => {
    expect(getDeviceVariants(123456)).toEqual([]);
  });
});

describe('pickDefaultDevice', () => {
  const variants = parseVariants([
    goodVariant,
    { ...goodVariant, device: 'airfryer' },
  ]).get(9000001) as DeviceVariant[];

  it("returns the first of tonight's devices that has a variant", () => {
    const tonight: CookingDevice[] = ['grill', 'airfryer', 'crockpot'];
    expect(pickDefaultDevice(tonight, variants)).toBe('airfryer');
  });

  it('returns null when nothing matches or nothing is selected', () => {
    expect(pickDefaultDevice(['grill'], variants)).toBeNull();
    expect(pickDefaultDevice([], variants)).toBeNull();
    expect(pickDefaultDevice(['crockpot'], [])).toBeNull();
  });

  it('prefers Original when an earlier tonight device matches natively', () => {
    const native = new Set<CookingDevice>(['grill']);
    expect(pickDefaultDevice(['grill', 'airfryer'], variants, native)).toBeNull();
  });

  it('native match on a LATER device does not block an earlier variant', () => {
    const native = new Set<CookingDevice>(['grill']);
    expect(pickDefaultDevice(['airfryer', 'grill'], variants, native)).toBe('airfryer');
  });

  it('a device that is both native and variant resolves to Original', () => {
    const native = new Set<CookingDevice>(['airfryer']);
    expect(pickDefaultDevice(['airfryer'], variants, native)).toBeNull();
  });
});
