import * as beforeAfterService from './beforeAfter.service.js';


const createCase =
  async (
    req,
    res
  ) => {
    const item =
      await beforeAfterService
        .createCase({
          data:
            req.body,

          beforeFile:
            req.files
              .beforeImage[0],

          afterFile:
            req.files
              .afterImage[0],

          userId:
            req.user.id,
        });


    res.status(201).json({
      success: true,

      message:
        'Before/after case created',

      data: {
        case: item,
      },
    });
  };


const getCases =
  async (
    req,
    res
  ) => {
    const result =
      await beforeAfterService
        .getPublicCases(
          req.validatedQuery ||
          req.query
        );


    res.status(200).json({
      success: true,

      data: result,
    });
  };


const getCase =
  async (
    req,
    res
  ) => {
    const item =
      await beforeAfterService
        .getPublicCaseById(
          req.params.id
        );


    res.status(200).json({
      success: true,

      data: {
        case: item,
      },
    });
  };


const getAdminCases =
  async (
    req,
    res
  ) => {
    const result =
      await beforeAfterService
        .getAdminCases(
          req.validatedQuery ||
          req.query
        );


    res.status(200).json({
      success: true,

      data: result,
    });
  };


const updateCase =
  async (
    req,
    res
  ) => {
    const item =
      await beforeAfterService
        .updateCase(
          req.params.id,
          req.body
        );


    res.status(200).json({
      success: true,

      data: {
        case: item,
      },
    });
  };


const replaceBeforeImage =
  async (
    req,
    res
  ) => {
    const item =
      await beforeAfterService
        .replaceCaseImage(
          req.params.id,
          'before',
          req.file
        );


    res.status(200).json({
      success: true,

      message:
        'Before image updated',

      data: {
        case: item,
      },
    });
  };


const replaceAfterImage =
  async (
    req,
    res
  ) => {
    const item =
      await beforeAfterService
        .replaceCaseImage(
          req.params.id,
          'after',
          req.file
        );


    res.status(200).json({
      success: true,

      message:
        'After image updated',

      data: {
        case: item,
      },
    });
  };


const disableCase =
  async (
    req,
    res
  ) => {
    await beforeAfterService
      .disableCase(
        req.params.id
      );


    res.status(200).json({
      success: true,

      message:
        'Before/after case disabled',
    });
  };


const restoreCase =
  async (
    req,
    res
  ) => {
    const item =
      await beforeAfterService
        .restoreCase(
          req.params.id
        );


    res.status(200).json({
      success: true,

      message:
        'Before/after case restored',

      data: {
        case: item,
      },
    });
  };


const withdrawConsent = async (req, res) => {
  const item = await beforeAfterService.withdrawConsent(
    req.params.id,
    {
      reason: req.body.reason,
      userId: req.user.id,
    }
  );
  res.status(200).json({
    success: true,
    message: 'Publication consent withdrawn',
    data: { case: item },
  });
};


const purgeCaseMedia = async (req, res) => {
  const item = await beforeAfterService.purgeCaseMedia(
    req.params.id,
    {
      reason: req.body.reason,
      userId: req.user.id,
    }
  );
  res.status(202).json({
    success: true,
    message: 'Permanent media purge recorded and cleanup scheduled',
    data: { case: item },
  });
};


export {
  createCase,
  getCases,
  getCase,
  getAdminCases,
  updateCase,
  replaceBeforeImage,
  replaceAfterImage,
  disableCase,
  restoreCase,
  withdrawConsent,
  purgeCaseMedia,
};
