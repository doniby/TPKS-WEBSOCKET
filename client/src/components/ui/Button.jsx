import PropTypes from "prop-types";

const Button = ({
  type = "button",
  variant = "default",
  icon: Icon,
  iconOnly = false,
  className = "",
  children,
  ...props
}) => {
  const variantClass = {
    default: "btn",
    primary: "btn primary",
    destructive: "btn destructive",
    warn: "btn warn",
  }[variant] || "btn";

  return (
    <button
      type={type}
      className={`${variantClass} ${iconOnly ? "icon-only" : ""} ${className}`.trim()}
      {...props}
    >
      {Icon && <Icon size={15} strokeWidth={2.2} className="btn-icon" aria-hidden="true" />}
      {children}
    </button>
  );
};

Button.propTypes = {
  type: PropTypes.oneOf(["button", "submit", "reset"]),
  variant: PropTypes.oneOf(["default", "primary", "destructive", "warn"]),
  icon: PropTypes.elementType,
  iconOnly: PropTypes.bool,
  className: PropTypes.string,
  children: PropTypes.node,
};

export default Button;
