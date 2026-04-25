import PropTypes from "prop-types";

const Card = ({ as: Tag = "section", className = "", children, ...props }) => {
  return (
    <Tag className={`surface ${className}`.trim()} {...props}>
      {children}
    </Tag>
  );
};

Card.propTypes = {
  as: PropTypes.elementType,
  className: PropTypes.string,
  children: PropTypes.node,
};

export default Card;
