import * as categoryService from './serviceCategory.service.js';

const createCategory = async (
  req,
  res
) => {
  const category =
    await categoryService.createCategory(
      req.body
    );

  res.status(201).json({
    success: true,
    data: { category },
  });
};

const getCategories = async (
  req,
  res
) => {
  const categories =
    await categoryService.getPublicCategories();

  res.status(200).json({
    success: true,
    data: { categories },
  });
};

const getAdminCategories = async (
  req,
  res
) => {
  const categories =
    await categoryService.getAdminCategories();

  res.status(200).json({
    success: true,
    data: { categories },
  });
};

const getCategory = async (
  req,
  res
) => {
  const category =
    await categoryService.getCategoryBySlug(
      req.params.slug
    );

  res.status(200).json({
    success: true,
    data: { category },
  });
};

const updateCategory = async (
  req,
  res
) => {
  const category =
    await categoryService.updateCategory(
      req.params.id,
      req.body
    );

  res.status(200).json({
    success: true,
    data: { category },
  });
};

const deleteCategory = async (
  req,
  res
) => {
  await categoryService.deleteCategory(
    req.params.id
  );

  res.status(200).json({
    success: true,
    message:
      'Category disabled successfully',
  });
};

const restoreCategory = async (
  req,
  res
) => {
  const category =
    await categoryService.restoreCategory(
      req.params.id
    );

  res.status(200).json({
    success: true,
    data: { category },
  });
};

export {
  createCategory,
  getCategories,
  getAdminCategories,
  getCategory,
  updateCategory,
  deleteCategory,
  restoreCategory,
};
