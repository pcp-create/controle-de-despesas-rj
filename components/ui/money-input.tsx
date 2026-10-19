"use client";

import type { InputHTMLAttributes } from "react";
import { formatMoneyInput, parseMoneyDigits } from "@/lib/money-input";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "defaultValue"> & {
  value: string | number;
  onValueChange: (value: string) => void;
};

export function MoneyInput({ value, onValueChange, ...props }: Props) {
  return <input {...props} type="text" inputMode="numeric" value={formatMoneyInput(value)}
    onChange={(event) => onValueChange(parseMoneyDigits(event.target.value))}
    onKeyDown={(event) => {
      props.onKeyDown?.(event);
      if (event.key === ',' || event.key === '.') event.preventDefault();
    }} />;
}
