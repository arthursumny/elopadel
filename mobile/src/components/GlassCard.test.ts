import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { GlassCard, type GlassCardVariant } from './GlassCard';

describe('GlassCard Component Unit Test Suite (`GlassCard.tsx`)', () => {
  it('TC-CARD-01: calling GlassCard({ children, glow: "lime" }) renders neon-lime glow styles', () => {
    const childrenNode = React.createElement('TextMock', null, 'Card Neon Lime');
    const element = GlassCard({
      children: childrenNode,
      glow: 'lime',
    }) as any;

    expect(element).toBeDefined();
    expect(element.type).toBe('View');
    expect(element.props.children).toBe(childrenNode);

    const styles = element.props.style;
    const glowStyle = styles.find((s: any) => s && s.shadowColor === '#c9ff4a');
    expect(glowStyle).toBeDefined();
    expect(glowStyle.borderColor).toBe('rgba(201, 255, 74, 0.4)');
    expect(glowStyle.shadowRadius).toBe(12);
  });

  it('TC-CARD-02: calling GlassCard with glow="cyan" and glow="coral" renders matching accents', () => {
    const elementCyan = GlassCard({
      children: 'Cyan Card',
      glow: 'cyan',
    }) as any;
    const cyanStyle = elementCyan.props.style.find((s: any) => s && s.shadowColor === '#4ce2d1');
    expect(cyanStyle).toBeDefined();
    expect(cyanStyle.borderColor).toBe('rgba(76, 226, 209, 0.4)');

    const elementCoral = GlassCard({
      children: 'Coral Card',
      glow: 'coral',
    }) as any;
    const coralStyle = elementCoral.props.style.find((s: any) => s && s.shadowColor === '#ff836b');
    expect(coralStyle).toBeDefined();
    expect(coralStyle.borderColor).toBe('rgba(255, 131, 107, 0.4)');
  });

  it('TC-CARD-03: calling GlassCard with glow=true defaults to neon-lime variant', () => {
    const element = GlassCard({
      children: 'Boolean Glow',
      glow: true,
    }) as any;

    const styles = element.props.style;
    const glowStyle = styles.find((s: any) => s && s.shadowColor === '#c9ff4a');
    expect(glowStyle).toBeDefined();
  });

  it('TC-CARD-04: passes className to root View for NativeWind styling', () => {
    const element = GlassCard({
      children: 'Styled Card',
      className: 'mb-4 p-5 rounded-3xl border border-lime-400/30',
    }) as any;

    expect(element.type).toBe('View');
    expect(element.props.className).toBe('mb-4 p-5 rounded-3xl border border-lime-400/30');
  });

  it('TC-CARD-05: renders TouchableOpacity with onPress and className when interactive', () => {
    const onPressMock = vi.fn();
    const element = GlassCard({
      children: 'Interactive Card',
      className: 'active:scale-95',
      onPress: onPressMock,
      variant: 'elevated',
    }) as any;

    expect(element.type).toBe('TouchableOpacity');
    expect(element.props.onPress).toBe(onPressMock);
    expect(element.props.className).toBe('active:scale-95');
    expect(element.props.activeOpacity).toBe(0.82);

    const styles = element.props.style;
    const elevatedStyle = styles.find((s: any) => s && s.elevation === 8);
    expect(elevatedStyle).toBeDefined();
  });

  it('TC-CARD-06: renders default subtle glass background when glow is not provided', () => {
    const element = GlassCard({
      children: 'Standard Card',
    }) as any;

    expect(element.type).toBe('View');
    const styles = element.props.style;
    const defaultStyle = styles.find(
      (s: any) => s && s.backgroundColor === 'rgba(16, 20, 28, 0.85)'
    );
    expect(defaultStyle).toBeDefined();
    expect(defaultStyle.borderColor).toBe('rgba(38, 48, 61, 0.8)');
  });
});
