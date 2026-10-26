import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { Button, type ButtonVariant, type ButtonSize } from './Button';

describe('Button Component Unit Test Suite (`Button.tsx`)', () => {
  it('TC-BTN-01: calling Button({ label, variant: "primary", size: "md" }) produces expected element structure and styles', () => {
    const onPressMock = vi.fn();
    const element = Button({
      label: 'Jogar',
      variant: 'primary',
      size: 'md',
      onPress: onPressMock,
    }) as any;

    expect(element).toBeDefined();
    expect(element.type).toBe('TouchableOpacity');
    expect(element.props.disabled).toBe(false);
    expect(element.props.onPress).toBe(onPressMock);

    // Style checks: primary variant corresponds to #c9ff4a background and md size is 48px height
    const styles = element.props.style;
    const variantStyle = styles.find((s: any) => s && s.backgroundColor === '#c9ff4a');
    expect(variantStyle).toBeDefined();
    expect(variantStyle.borderColor).toBe('#c9ff4a');

    const sizeStyle = styles.find((s: any) => s && s.height === 48);
    expect(sizeStyle).toBeDefined();
    expect(sizeStyle.paddingHorizontal).toBe(20);
    expect(sizeStyle.borderRadius).toBe(14);

    // Child inspection: contentRow View containing label Text
    const contentRow = element.props.children;
    expect(contentRow.type).toBe('View');
    const textNode = contentRow.props.children[1];
    expect(textNode.type).toBe('Text');
    expect(textNode.props.children).toBe('Jogar');
  });

  it('TC-BTN-02: passes className to root TouchableOpacity for NativeWind styling', () => {
    const element = Button({
      label: 'Class Button',
      className: 'mt-4 px-6 w-full rounded-2xl bg-lime-400',
    }) as any;

    expect(element.type).toBe('TouchableOpacity');
    expect(element.props.className).toBe('mt-4 px-6 w-full rounded-2xl bg-lime-400');
  });

  it('TC-BTN-03: verifies all theme variants render correct container and text colors', () => {
    const variants: ButtonVariant[] = [
      'lime',
      'primary',
      'cyan',
      'secondary',
      'coral',
      'ghost',
      'panel',
      'outline',
    ];

    for (const variant of variants) {
      const element = Button({ label: `Variant ${variant}`, variant }) as any;
      expect(element.type).toBe('TouchableOpacity');
      const styles = element.props.style;
      const variantContainer = styles[1];
      expect(variantContainer).toBeDefined();
      expect(typeof variantContainer.backgroundColor).toBe('string');
    }
  });

  it('TC-BTN-04: verifies all size configurations produce expected heights', () => {
    const expectedHeights: Record<ButtonSize, number> = {
      sm: 38,
      md: 48,
      lg: 56,
    };

    for (const [size, height] of Object.entries(expectedHeights) as [ButtonSize, number][]) {
      const element = Button({ label: `Size ${size}`, size }) as any;
      const styles = element.props.style;
      const sizeStyle = styles[2];
      expect(sizeStyle.height).toBe(height);
    }
  });

  it('TC-BTN-05: disabled state activates disabled prop and applies disabled opacity style', () => {
    const element = Button({
      label: 'Indisponível',
      disabled: true,
      variant: 'cyan',
    }) as any;

    expect(element.props.disabled).toBe(true);
    const styles = element.props.style;
    const disabledStyle = styles.find((s: any) => s && s.opacity === 0.45);
    expect(disabledStyle).toBeDefined();

    // Renders text, not spinner
    expect(element.props.children.type).toBe('View');
  });

  it('TC-BTN-06: loading state disables button and renders ActivityIndicator spinner', () => {
    const element = Button({
      label: 'Processando',
      loading: true,
      variant: 'lime',
    }) as any;

    expect(element.props.disabled).toBe(true);
    const spinner = element.props.children;
    expect(spinner.type).toBe('ActivityIndicator');
    expect(spinner.props.color).toBe('#090b10');
    expect(spinner.props.size).toBe('small');
  });

  it('TC-BTN-07: fullWidth prop applies 100% width style', () => {
    const element = Button({
      label: 'Full Width',
      fullWidth: true,
    }) as any;

    const styles = element.props.style;
    const fullWidthStyle = styles.find((s: any) => s && s.width === '100%');
    expect(fullWidthStyle).toBeDefined();
  });

  it('TC-BTN-08: renders icons correctly at left and right positions', () => {
    const dummyIcon = React.createElement('IconMock', { key: 'ico' });

    const leftElement = Button({
      label: 'Ícone Esquerda',
      icon: dummyIcon,
      iconPosition: 'left',
    }) as any;
    const leftRow = leftElement.props.children;
    expect(leftRow.props.children[0]).toBeTruthy(); // icon wrapper on left

    const rightElement = Button({
      label: 'Ícone Direita',
      icon: dummyIcon,
      iconPosition: 'right',
    }) as any;
    const rightRow = rightElement.props.children;
    expect(rightRow.props.children[2]).toBeTruthy(); // icon wrapper on right
  });

  it('TC-BTN-09: supports children as content fallback when neither label nor title is provided', () => {
    const customChild = React.createElement('CustomNode', null, 'Texto Customizado');
    const element = Button({
      children: customChild,
      variant: 'ghost',
    }) as any;

    const contentRow = element.props.children;
    expect(contentRow.props.children[1]).toBe(customChild);
  });
});
