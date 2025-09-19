import React, { useState, useEffect } from 'react';

interface DateInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  required?: boolean;
}

export default function DateInput({ value, onChange, className = '', placeholder = '', required = false }: DateInputProps) {
  const [inputValue, setInputValue] = useState(value);
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const formatDateInput = (input: string) => {
    // 숫자만 추출
    const numbers = input.replace(/\D/g, '');
    
    // 8자리 숫자가 입력되면 YYYY-MM-DD 형식으로 변환
    if (numbers.length === 8) {
      const year = numbers.substring(0, 4);
      const month = numbers.substring(4, 6);
      const day = numbers.substring(6, 8);
      
      // 유효한 날짜인지 검증
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      if (date.getFullYear() == parseInt(year) && 
          date.getMonth() == parseInt(month) - 1 && 
          date.getDate() == parseInt(day)) {
        return `${year}-${month}-${day}`;
      }
    }
    
    return input;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setIsTyping(true);
    
    // 8자리 숫자가 입력되면 자동으로 포맷팅하고 onChange 호출
    const numbers = newValue.replace(/\D/g, '');
    if (numbers.length === 8) {
      const formatted = formatDateInput(newValue);
      if (formatted !== newValue) {
        setInputValue(formatted);
        onChange(formatted);
        setIsTyping(false);
        return;
      }
    }
    
    // 일반적인 날짜 형식 입력의 경우
    onChange(newValue);
  };

  const handleBlur = () => {
    setIsTyping(false);
    // blur 시에도 포맷팅 시도
    const formatted = formatDateInput(inputValue);
    if (formatted !== inputValue) {
      setInputValue(formatted);
      onChange(formatted);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // 숫자, 백스페이스, 딜리트, 화살표 키, 하이픈만 허용
    const allowedKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', '-'];
    const isNumber = /^[0-9]$/.test(e.key);
    
    if (!isNumber && !allowedKeys.includes(e.key)) {
      e.preventDefault();
    }
  };

  return (
    <input
      type="text"
      value={inputValue}
      onChange={handleInputChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={`${className}`}
      placeholder={placeholder || "YYYY-MM-DD 또는 YYYYMMDD"}
      required={required}
      maxLength={10}
    />
  );
}
