import crypto from 'crypto';

const requestId = (req, res, next) => {
  const id = crypto.randomUUID();

  req.id = id;

  res.setHeader(
    'X-Request-Id',
    id
  );

  next();
};

export default requestId;
