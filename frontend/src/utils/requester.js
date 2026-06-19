export const getRequesterId = (user) => {
  if (user?.id) return user.id;
  if (user?._id) return user._id;

  try {
    const savedUser = JSON.parse(localStorage.getItem("user") || "null");
    return savedUser?.id || savedUser?._id || "";
  } catch {
    return "";
  }
};

export const buildRequesterHeaders = (user, headers = {}) => {
  const requesterId = getRequesterId(user);
  return requesterId
    ? { ...headers, "X-User-Id": requesterId }
    : { ...headers };
};
