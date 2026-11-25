import { useId } from 'react';
import { fecha, fechaConMeses, type Duracion } from '../lib/format';
import { Campo } from './UI';

interface SelectDuracionProps {
  duracion: Duracion;
  onCambiar: (duracion: Duracion) => void;
  fechaPersonalizada: string;
  base?: Date;
}

export function SelectDuracion({
  duracion,
  onCambiar,
  fechaPersonalizada,
  base,
}: SelectDuracionProps) {
  const id = useId();
  const vence =
    duracion === 'personalizado' ? fechaPersonalizada : fechaConMeses(duracion, base);

  return (
    <Campo
      etiqueta="Duración"
      htmlFor={id}
      ayuda={
        duracion === 'personalizado'
          ? 'Indica la fecha exacta abajo.'
          : `Vence el ${fecha(vence)}`
      }
    >
      <select
        id={id}
        value={String(duracion)}
        onChange={(evento) => {
          const valor = evento.target.value;
          onCambiar(
            valor === 'personalizado'
              ? 'personalizado'
              : (Number(valor) as 1 | 3 | 6 | 12)
          );
        }}
      >
        <option value="1">Mensual (1 mes)</option>
        <option value="3">Trimestral (3 meses)</option>
        <option value="6">Semestral (6 meses)</option>
        <option value="12">Anual (12 meses)</option>
        <option value="personalizado">Personalizado</option>
      </select>
    </Campo>
  );
}
