import PropTypes from "prop-types";

const Textarea = ({ className = "", ...props }) => {
  return <textarea className={`textarea ${className}`.trim()} {...props} />;
};

Textarea.propTypes = {
  className: PropTypes.string,
};

export default Textarea;
