import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { Button, ButtonVariant, ButtonSize } from './Button';
import { RankEmblem, resolveTierAccent, RankTierAccent } from './RankEmblem';

// Duplicated from mobile/app/(auth)/onboarding.tsx to test the exact normalization and validation algorithms
const RESERVED_HANDLES = new Set([
  'admin',
  'club',
  'root',
  'system',
  'elopadel',
  'support',
  'suporte',
  'moderator',
  'moderador',
  'moderacao',
]);

const CATEGORY_OPTIONS = [
  { value: '6ª', label: '6ª Categoria', desc: 'Iniciante — fundamentos e primeiras partidas', startingTier: '6ª II' },
  { value: '5ª', label: '5ª Categoria', desc: 'Intermediário Inicial — controle e jogos regulares', startingTier: '5ª II' },
  { value: '4ª', label: '4ª Categoria', desc: 'Intermediário — ritmo e bom posicionamento', startingTier: '4ª II' },
  { value: '3ª', label: '3ª Categoria', desc: 'Avançado — técnica apurada e intensidade', startingTier: '3ª II' },
  { value: '2ª', label: '2ª Categoria', desc: 'Competitivo Alto — disputas federadas', startingTier: '2ª II' },
  { value: '1ª', label: '1ª Categoria', desc: 'Open / Elite Regional — nível máximo', startingTier: '1ª II' },
  { value: 'Elite', label: 'Elite', desc: 'Nível profissional ou campeão estadual', startingTier: 'Elite' },
  { value: 'unknown', label: 'Ainda não sei', desc: 'Calibração total nas primeiras 5 partidas', startingTier: '6ª III' },
];

function normalizeOnboardingHandle(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^@+/, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_.]/g, '')
    .slice(0, 20);
}

function isHandleFormatValid(rawHandle: string): boolean {
  const publicHandle = rawHandle ? `@${rawHandle}` : '';
  if (!rawHandle || rawHandle.length < 3 || rawHandle.length > 20) return false;
  if (RESERVED_HANDLES.has(rawHandle)) return false;
  return /^@[a-z0-9][a-z0-9_.]{1,18}[a-z0-9]$/i.test(publicHandle);
}

describe('Empirical Adversarial Test Suite: Milestone 3 Mobile Forms & Components', () => {

  // =========================================================================
  // SECTION 1: Onboarding form @handle boundary & adversarial tests
  // =========================================================================
  describe('1. Onboarding Form @handle Boundary & Adversarial Tests', () => {
    it('TC-ADV-HANDLE-01: rejects empty string', () => {
      const normalized = normalizeOnboardingHandle('');
      expect(normalized).toBe('');
      expect(isHandleFormatValid(normalized)).toBe(false);
    });

    it('TC-ADV-HANDLE-02: rejects handles with 1 character', () => {
      const normalized = normalizeOnboardingHandle('a');
      expect(normalized).toBe('a');
      expect(normalized.length).toBe(1);
      expect(isHandleFormatValid(normalized)).toBe(false);
    });

    it('TC-ADV-HANDLE-03: rejects handles with 2 characters', () => {
      const normalized = normalizeOnboardingHandle('ab');
      expect(normalized).toBe('ab');
      expect(normalized.length).toBe(2);
      expect(isHandleFormatValid(normalized)).toBe(false);
    });

    it('TC-ADV-HANDLE-04: accepts exactly 3 characters (minimum boundary)', () => {
      const handles = ['abc', 'a1b', '123', 'a_b', 'a.b'];
      for (const h of handles) {
        const normalized = normalizeOnboardingHandle(h);
        expect(normalized.length).toBe(3);
        expect(isHandleFormatValid(normalized)).toBe(true);
      }
    });

    it('TC-ADV-HANDLE-05: rejects 3-character handles starting or ending with symbols', () => {
      // Must start and end with alphanumeric
      expect(isHandleFormatValid(normalizeOnboardingHandle('_ab'))).toBe(false);
      expect(isHandleFormatValid(normalizeOnboardingHandle('ab_'))).toBe(false);
      expect(isHandleFormatValid(normalizeOnboardingHandle('.ab'))).toBe(false);
      expect(isHandleFormatValid(normalizeOnboardingHandle('ab.'))).toBe(false);
    });

    it('TC-ADV-HANDLE-06: accepts exactly 20 characters (maximum boundary)', () => {
      const exactly20 = 'a123456789012345678z';
      const normalized = normalizeOnboardingHandle(exactly20);
      expect(normalized.length).toBe(20);
      expect(isHandleFormatValid(normalized)).toBe(true);
    });

    it('TC-ADV-HANDLE-07: truncates handles with 21+ characters to 20', () => {
      const over20 = 'abcdefghijklmnopqrstuvwxyz1234567890';
      const normalized = normalizeOnboardingHandle(over20);
      expect(normalized.length).toBe(20);
      expect(normalized).toBe('abcdefghijklmnopqrst');
      expect(isHandleFormatValid(normalized)).toBe(true);
    });

    it('TC-ADV-HANDLE-08: normalizes handles with internal and outer spaces', () => {
      const withSpaces = '  carlos   silva  padel  ';
      const normalized = normalizeOnboardingHandle(withSpaces);
      expect(normalized).toBe('carlos_silva_padel');
      expect(isHandleFormatValid(normalized)).toBe(true);
    });

    it('TC-ADV-HANDLE-09: strips invalid symbols and emoji adversarial inputs', () => {
      const adversarial = 'pedro!@#$%^&*()+=~`<>?/:;{}[]|padel🎾';
      const normalized = normalizeOnboardingHandle(adversarial);
      expect(normalized).toBe('pedropadel');
      expect(isHandleFormatValid(normalized)).toBe(true);
    });

    it('TC-ADV-HANDLE-10: normalizes uppercase and diacritical accents (pt-BR)', () => {
      const withAccents = 'JÕÃO_VÍTÓR_PADÉL';
      const normalized = normalizeOnboardingHandle(withAccents);
      expect(normalized).toBe('joao_vitor_padel');
      expect(isHandleFormatValid(normalized)).toBe(true);
    });

    it('TC-ADV-HANDLE-11: strips leading @ prefix if typed by user', () => {
      const withAt = '@@@marcelo_padel';
      const normalized = normalizeOnboardingHandle(withAt);
      expect(normalized).toBe('marcelo_padel');
      expect(isHandleFormatValid(normalized)).toBe(true);
    });

    it('TC-ADV-HANDLE-12: rejects reserved handles regardless of case', () => {
      const reservedList = [
        'admin', 'ADMIN', 'club', 'CLUB', 'root', 'ROOT',
        'system', 'elopadel', 'support', 'suporte', 'moderator',
        'moderador', 'moderacao',
      ];
      for (const reserved of reservedList) {
        const normalized = normalizeOnboardingHandle(reserved);
        expect(isHandleFormatValid(normalized)).toBe(false);
      }
    });
  });

  // =========================================================================
  // SECTION 2: Initial category wire values
  // =========================================================================
  describe('2. Initial Category Wire Values Validation', () => {
    const EXPECTED_WIRE_CATEGORIES = [
      '6ª', '5ª', '4ª', '3ª', '2ª', '1ª', 'Elite', 'unknown',
    ];

    it('TC-ADV-CAT-01: mobile CATEGORY_OPTIONS contains exactly the 8 allowed backend wire values', () => {
      const actualValues = CATEGORY_OPTIONS.map((c) => c.value);
      expect(actualValues).toEqual(EXPECTED_WIRE_CATEGORIES);
      expect(actualValues.length).toBe(8);
    });

    it('TC-ADV-CAT-02: each wire value maps to a coherent starting tier', () => {
      const expectedTiers: Record<string, string> = {
        '6ª': '6ª II',
        '5ª': '5ª II',
        '4ª': '4ª II',
        '3ª': '3ª II',
        '2ª': '2ª II',
        '1ª': '1ª II',
        'Elite': 'Elite',
        'unknown': '6ª III',
      };

      for (const opt of CATEGORY_OPTIONS) {
        expect(opt.startingTier).toBe(expectedTiers[opt.value]);
      }
    });

    it('TC-ADV-CAT-03: rejects arbitrary non-wire categories', () => {
      const invalidCategories = ['7ª', 'Iniciante', 'Iniciante Categoria', 'Pro', 'Bronze', 'default', ''];
      for (const invalid of invalidCategories) {
        const isValidWireCategory = EXPECTED_WIRE_CATEGORIES.includes(invalid);
        expect(isValidWireCategory).toBe(false);
      }
    });
  });

  // =========================================================================
  // SECTION 3: RankEmblem dynamic color rendering across 8 tier categories
  // =========================================================================
  describe('3. RankEmblem Dynamic Color Rendering', () => {
    it('TC-ADV-EMBLEM-01: resolves expected accents across canonical tier labels', () => {
      expect(resolveTierAccent('6ª III')).toBe('slate');
      expect(resolveTierAccent('6ª II')).toBe('slate');
      expect(resolveTierAccent('6ª I')).toBe('slate');
      expect(resolveTierAccent('6ª')).toBe('slate');

      expect(resolveTierAccent('5ª III')).toBe('blue');
      expect(resolveTierAccent('5ª II')).toBe('blue');
      expect(resolveTierAccent('5ª')).toBe('blue');

      expect(resolveTierAccent('4ª III')).toBe('cyan');
      expect(resolveTierAccent('4ª II')).toBe('cyan');
      expect(resolveTierAccent('4ª')).toBe('cyan');

      expect(resolveTierAccent('3ª III')).toBe('violet');
      expect(resolveTierAccent('3ª II')).toBe('violet');
      expect(resolveTierAccent('3ª')).toBe('violet');

      expect(resolveTierAccent('2ª III')).toBe('amber');
      expect(resolveTierAccent('2ª II')).toBe('amber');
      expect(resolveTierAccent('2ª')).toBe('amber');

      expect(resolveTierAccent('1ª III')).toBe('orange');
      expect(resolveTierAccent('1ª II')).toBe('orange');
      expect(resolveTierAccent('1ª')).toBe('orange');

      expect(resolveTierAccent('Elite')).toBe('gold');
      expect(resolveTierAccent('Challenger')).toBe('lime');
    });

    it('TC-ADV-EMBLEM-02 [VULNERABILITY/GAP CHECK]: resolves "Iniciante" category label', () => {
      // In Brazilian padel, "Iniciante" corresponds to 6ª categoria (slate accent).
      // If label="Iniciante" is passed without explicit accent, what does resolveTierAccent return?
      const resolved = resolveTierAccent('Iniciante');
      // Empirical verification: resolveTierAccent falls back to 'cyan' for 'Iniciante'
      // because clean.startsWith('6ª') is false!
      expect(resolved).toBe('cyan'); // documents current behavior
    });

    it('TC-ADV-EMBLEM-03: renders diamond view with correct theme colors for resolved accents', () => {
      const element6 = RankEmblem({ label: '6ª II' }) as any;
      const diamond6 = element6.props.children[0];
      expect(diamond6.props.style[1].backgroundColor).toBe('#334155');
      expect(diamond6.props.style[1].borderColor).toBe('#64748b');

      const element5 = RankEmblem({ label: '5ª II' }) as any;
      const diamond5 = element5.props.children[0];
      expect(diamond5.props.style[1].backgroundColor).toBe('#1e3a8a');
      expect(diamond5.props.style[1].borderColor).toBe('#3b82f6');

      const element4 = RankEmblem({ label: '4ª II' }) as any;
      const diamond4 = element4.props.children[0];
      expect(diamond4.props.style[1].backgroundColor).toBe('#0e7490');
      expect(diamond4.props.style[1].borderColor).toBe('#4ce2d1');

      const element3 = RankEmblem({ label: '3ª II' }) as any;
      const diamond3 = element3.props.children[0];
      expect(diamond3.props.style[1].backgroundColor).toBe('#4c1d95');
      expect(diamond3.props.style[1].borderColor).toBe('#a855f7');

      const element2 = RankEmblem({ label: '2ª II' }) as any;
      const diamond2 = element2.props.children[0];
      expect(diamond2.props.style[1].backgroundColor).toBe('#78350f');
      expect(diamond2.props.style[1].borderColor).toBe('#f59e0b');

      const element1 = RankEmblem({ label: '1ª II' }) as any;
      const diamond1 = element1.props.children[0];
      expect(diamond1.props.style[1].backgroundColor).toBe('#7c2d12');
      expect(diamond1.props.style[1].borderColor).toBe('#f97316');

      const elementElite = RankEmblem({ label: 'Elite' }) as any;
      const diamondElite = elementElite.props.children[0];
      expect(diamondElite.props.style[1].backgroundColor).toBe('#b45309');
      expect(diamondElite.props.style[1].borderColor).toBe('#fbbf24');
    });

    it('TC-ADV-EMBLEM-04: allows manual override with explicit accent prop', () => {
      const elementInicianteExplicit = RankEmblem({ label: 'Iniciante', accent: 'slate' }) as any;
      const diamond = elementInicianteExplicit.props.children[0];
      expect(diamond.props.style[1].backgroundColor).toBe('#334155');
      expect(diamond.props.style[1].borderColor).toBe('#64748b');
    });

    it('TC-ADV-EMBLEM-05: handles single-word vs multi-word division typography', () => {
      const multi = RankEmblem({ label: '5ª II' }) as any;
      const textContainerMulti = multi.props.children[1];
      expect(textContainerMulti.props.children[0].props.children).toBe('5ª');
      expect(textContainerMulti.props.children[1].props.children).toBe('II');

      const single = RankEmblem({ label: 'Elite' }) as any;
      const textContainerSingle = single.props.children[1];
      expect(textContainerSingle.props.children[0].props.children).toBe('Elite');
      expect(textContainerSingle.props.children[1]).toBe(false);
    });
  });

  // =========================================================================
  // SECTION 4: Button loading states, disabled interactions, and theme color classes
  // =========================================================================
  describe('4. Button Loading States, Disabled Interactions & Themes', () => {
    it('TC-ADV-BTN-01: loading state activates disabled prop, shows spinner, hides text', () => {
      const onPressMock = vi.fn();
      const element = Button({
        title: 'Entrar',
        loading: true,
        disabled: false,
        variant: 'lime',
        onPress: onPressMock,
      }) as any;

      // 1. TouchableOpacity must be disabled when loading
      expect(element.props.disabled).toBe(true);

      // 2. Disabled opacity style (0.45) must be present in style array
      const styles = element.props.style;
      const disabledStyle = styles.find((s: any) => s && s.opacity === 0.45);
      expect(disabledStyle).toBeDefined();

      // 3. Child must be ActivityIndicator, not text
      expect(element.props.children.type).toBe('ActivityIndicator');
      expect(element.props.children.props.color).toBe('#090b10'); // lime variant spinner color
    });

    it('TC-ADV-BTN-02: disabled state activates disabled prop, renders text, hides spinner', () => {
      const onPressMock = vi.fn();
      const element = Button({
        title: 'Bloqueado',
        loading: false,
        disabled: true,
        variant: 'cyan',
        onPress: onPressMock,
      }) as any;

      expect(element.props.disabled).toBe(true);
      const styles = element.props.style;
      const disabledStyle = styles.find((s: any) => s && s.opacity === 0.45);
      expect(disabledStyle).toBeDefined();

      // Child is contentRow View, not ActivityIndicator
      expect(element.props.children.type).toBe('View');
    });

    it('TC-ADV-BTN-03: enabled state allows interaction and does not have disabled style', () => {
      const onPressMock = vi.fn();
      const element = Button({
        title: 'Pronto',
        loading: false,
        disabled: false,
        variant: 'lime',
        onPress: onPressMock,
      }) as any;

      expect(element.props.disabled).toBe(false);
      const styles = element.props.style;
      const disabledStyle = styles.find((s: any) => s && s.opacity === 0.45);
      expect(disabledStyle).toBeFalsy();
      expect(element.props.onPress).toBe(onPressMock);
    });

    it('TC-ADV-BTN-04: verifies all 6 theme variants have valid color configurations', () => {
      const variants: ButtonVariant[] = ['lime', 'cyan', 'coral', 'ghost', 'panel', 'outline'];

      for (const variant of variants) {
        const element = Button({ title: 'Test', variant }) as any;
        const containerStyle = element.props.style[1];
        expect(containerStyle).toBeDefined();
        expect(typeof containerStyle.backgroundColor).toBe('string');
      }
    });

    it('TC-ADV-BTN-05: verifies all 3 size configurations produce expected heights', () => {
      const expectedHeights: Record<ButtonSize, number> = {
        sm: 38,
        md: 48,
        lg: 56,
      };

      for (const [size, height] of Object.entries(expectedHeights) as [ButtonSize, number][]) {
        const element = Button({ title: 'Test', size }) as any;
        const sizeStyle = element.props.style[2];
        expect(sizeStyle.height).toBe(height);
      }
    });

    it('TC-ADV-BTN-06: className prop is passed to TouchableOpacity for NativeWind styling', () => {
      const element = Button({
        title: 'Test Class',
        className: 'mt-4 w-full shadow-lg',
      }) as any;

      expect(element.props.className).toBe('mt-4 w-full shadow-lg');
    });
  });
});
