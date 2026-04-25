import PropTypes from "prop-types";

const Input = ({ className = "", ...props }) => {
  return <input className={`input ${className}`.trim()} {...props} />;
};

Input.propTypes = {
  className: PropTypes.string,
};

export default Input;
