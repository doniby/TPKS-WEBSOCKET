import PropTypes from "prop-types";

const Dialog = ({ open, onClose, title, children }) => {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        {title ? (
          <div className="modal-head">
            <h2 className="modal-title">{title}</h2>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
};

Dialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.string,
  children: PropTypes.node,
};

export default Dialog;
