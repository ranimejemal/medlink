// MedLink logo mark: a rounded cross, light-blue arm (top + right), blue arm (left + bottom)
// and a dark-blue overlap in the middle with two rounded corners.
export const LOGO_COLORS = { light: "#67DBFF", main: "#5B7FFF", deep: "#2723FF" } as const;

export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      <path fill={LOGO_COLORS.main} d="M15 35H65V85A15 15 0 0 1 35 85V65H15A15 15 0 0 1 15 35Z" />
      <path
        fill={LOGO_COLORS.light}
        d="M35 15A15 15 0 0 1 65 15V35H85A15 15 0 0 1 85 65H65V35H35Z"
      />
      <path fill={LOGO_COLORS.light} d="M35 35H65V65Z" />
      <path fill={LOGO_COLORS.deep} d="M35 35H47A18 18 0 0 1 65 53V65H53A18 18 0 0 1 35 47Z" />
    </svg>
  );
}
