const ExternalLinkIcon = (props) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="feather feather-external-link" {...props}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" stroke="currentColor"></path>
      <polyline points="15 3 21 3 21 9" stroke="currentColor"></polyline>
      <line x1="10" y1="14" x2="21" y2="3" stroke="currentColor"></line>
    </svg>
  );
};

export default ExternalLinkIcon;
