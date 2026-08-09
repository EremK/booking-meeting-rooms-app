import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('opens the native dialog and shows the title/message when open', () => {
    render(
      <ConfirmDialog
        open
        title="Скасувати бронювання?"
        message="«Синхронізація команди» більше не буде заброньовано."
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText('Скасувати бронювання?')).toBeInTheDocument();
    expect(screen.getByText('«Синхронізація команди» більше не буде заброньовано.')).toBeInTheDocument();
    expect(document.querySelector('dialog')?.open).toBe(true);
  });

  it('does not open the native dialog when closed', () => {
    render(<ConfirmDialog open={false} title="X" message="Y" onConfirm={() => {}} onCancel={() => {}} />);
    expect(document.querySelector('dialog')?.open).toBe(false);
  });

  it('calls onConfirm when the confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog open title="X" message="Y" onConfirm={onConfirm} onCancel={() => {}} />);
    fireEvent.click(screen.getByText('Підтвердити'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when the cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="X" message="Y" onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Скасувати'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons and shows a waiting label while isConfirming', () => {
    render(<ConfirmDialog open isConfirming title="X" message="Y" onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByText('Зачекайте…')).toBeDisabled();
    expect(screen.getByText('Скасувати')).toBeDisabled();
  });

  it('uses custom confirm/cancel labels when provided', () => {
    render(
      <ConfirmDialog
        open
        title="X"
        message="Y"
        confirmLabel="Скасувати серію"
        cancelLabel="Назад"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText('Скасувати серію')).toBeInTheDocument();
    expect(screen.getByText('Назад')).toBeInTheDocument();
  });
});
