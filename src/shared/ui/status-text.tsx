type StatusTextProps = {
  text: string;
  isError?: boolean;
};

export function StatusText({ text, isError = false }: StatusTextProps) {
  return <p className={isError ? "status status-error" : "status"}>{text}</p>;
}
