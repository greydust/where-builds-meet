/**
 * React reads this flag off the global object to decide whether `act()` is
 * allowed to flush effects synchronously. The jsdom specs set it before they
 * import the components under test; declaring it once here keeps that from
 * needing a cast at every assignment.
 */
declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

export {}
