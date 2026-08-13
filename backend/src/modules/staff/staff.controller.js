import * as staffService from './staff.service.js';

const listStaff = async (req, res) => {
  const result = await staffService.listStaff(req.query);
  res.status(200).json({ success: true, data: result });
};

const getStaff = async (req, res) => {
  const staff = await staffService.getStaffById(
    req.params.id
  );
  res.status(200).json({
    success: true,
    data: { staff },
  });
};

const inviteStaff = async (req, res) => {
  const staff = await staffService.inviteStaff(
    req.body,
    req.user.id
  );
  res.status(201).json({
    success: true,
    message: 'Staff invitation sent',
    data: { staff },
  });
};

const updateRole = async (req, res) => {
  const staff = await staffService.updateStaffRole(
    req.params.id,
    req.body.role,
    req.user.id
  );
  res.status(200).json({ success: true, data: { staff } });
};

const deactivate = async (req, res) => {
  const staff = await staffService.deactivateStaff(
    req.params.id,
    req.user.id
  );
  res.status(200).json({ success: true, data: { staff } });
};

const reactivate = async (req, res) => {
  const staff = await staffService.reactivateStaff(
    req.params.id
  );
  res.status(200).json({ success: true, data: { staff } });
};

const revokeSessions = async (req, res) => {
  const staff =
    await staffService.revokeAllStaffSessions(
      req.params.id
    );
  res.status(200).json({ success: true, data: { staff } });
};

export {
  listStaff,
  getStaff,
  inviteStaff,
  updateRole,
  deactivate,
  reactivate,
  revokeSessions,
};
