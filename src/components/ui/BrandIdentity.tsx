import nusLogo from '../../assets/images/nus_logo.png';

/** نام دانشکده، خط دوم مجموعه نشان و عنوان سامانه */
export const FACULTY_NAME = 'دانشکده مهارت و فناوری نیشابور';
export const SYSTEM_NAME = 'معاونت فرهنگی و دانشجویی';

interface BrandIdentityProps {
  title?: string;
  className?: string;
  logoClassName?: string;
  titleClassName?: string;
  subtitleClassName?: string;
  gapClassName?: string;
}

/**
 * نشان دانشگاه ملی مهارت همراه با عنوان دوخطی سامانه
 * (خط اول: عنوان سامانه، خط دوم: نام دانشکده)
 */
export function BrandIdentity({
  title = SYSTEM_NAME,
  className = '',
  logoClassName = 'h-10',
  titleClassName = 'text-sm font-extrabold',
  subtitleClassName = 'text-[11.5px] font-semibold',
  gapClassName = 'gap-2.5',
}: BrandIdentityProps) {
  return (
    <div className={`flex items-center min-w-0 ${gapClassName} ${className}`}>
      <img
        src={nusLogo}
        alt="نشان دانشگاه ملی مهارت"
        className={`w-auto shrink-0 object-contain ${logoClassName}`}
      />
      <div className="min-w-0">
        <div className={`leading-tight truncate ${titleClassName}`}>{title}</div>
        <div className={`mt-1 leading-tight ${subtitleClassName}`}>{FACULTY_NAME}</div>
      </div>
    </div>
  );
}
