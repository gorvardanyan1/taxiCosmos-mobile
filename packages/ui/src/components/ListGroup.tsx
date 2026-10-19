import { Children, isValidElement, type ReactNode } from 'react';
import { View } from 'react-native';

import { Card } from './Card';

/** A bordered box of rows (`MenuRow`s or `ListRow`s) with a hairline between them and none after the last, as in the template. */
export function ListGroup({ children, className }: { children: ReactNode; className?: string }) {
  const rows = Children.toArray(children).filter(isValidElement);

  return (
    <Card variant="outlined" className={className}>
      {rows.map((row, index) => (
        <View
          key={row.key ?? index}
          className={index < rows.length - 1 ? 'border-b border-slate-100 dark:border-slate-800' : undefined}
        >
          {row}
        </View>
      ))}
    </Card>
  );
}
