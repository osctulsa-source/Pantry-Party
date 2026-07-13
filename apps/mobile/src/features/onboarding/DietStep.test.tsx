import { fireEvent, render, screen } from '@testing-library/react-native';

import { DietStep } from './DietStep';

describe('DietStep', () => {
  it('renders both sections and toggles a diet tile on and off', () => {
    const onChange = jest.fn();
    render(<DietStep diets={[]} allergies={[]} onChange={onChange} onContinue={() => {}} />);
    expect(screen.getByText('Do you follow any diets?')).toBeTruthy();
    expect(screen.getByText('Any allergies?')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Vegetarian'));
    expect(onChange).toHaveBeenCalledWith({ diets: ['vegetarian'], allergies: [] });
  });

  it('deselects a selected tile and fires onContinue', () => {
    const onChange = jest.fn();
    const onContinue = jest.fn();
    render(
      <DietStep diets={['vegan']} allergies={['shellfish']} onChange={onChange} onContinue={onContinue} />,
    );
    fireEvent.press(screen.getByLabelText('Vegan, added'));
    expect(onChange).toHaveBeenCalledWith({ diets: [], allergies: ['shellfish'] });
    fireEvent.press(screen.getByText('Continue'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('toggles an allergy tile independently of diets', () => {
    const onChange = jest.fn();
    render(<DietStep diets={['vegetarian']} allergies={[]} onChange={onChange} onContinue={() => {}} />);
    fireEvent.press(screen.getByLabelText('Egg'));
    expect(onChange).toHaveBeenCalledWith({ diets: ['vegetarian'], allergies: ['egg'] });
  });
});
