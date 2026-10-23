/* global jest */
// The map is native (no device here): these stand-ins draw each map component as a plain View carrying the props it was given, so a test can
// read what the screen asked the map to show (its style, markers, line, camera moves). The camera's moves are recorded in `__camera`.
const React = require('react');
const { View } = require('react-native');

const __camera = { flyTo: jest.fn(), easeTo: jest.fn(), jumpTo: jest.fn() };

const host = (name) => {
  const Component = ({ children, ref: _ref, ...props }) =>
    React.createElement(View, { ...props, testID: name }, children);
  Component.displayName = name;

  return Component;
};

const Camera = ({ ref, ...props }) => {
  React.useImperativeHandle(ref, () => __camera);

  return React.createElement(View, { ...props, testID: 'Camera' });
};

module.exports = {
  __camera,
  Map: host('Map'),
  Camera,
  ViewAnnotation: host('ViewAnnotation'),
  GeoJSONSource: host('GeoJSONSource'),
  Layer: host('Layer'),
};
