"use strict";

var index = [];
var byName = {};

function isLeaf(node) {
  return node && !(node.children || []).length;
}

function walk(nodes, ancestors) {
  (nodes || []).forEach(function (node) {
    var next = ancestors.concat([node]);
    index.push({ node: node, path: next });
    byName[node.name] = node;
    walk(node.children, next);
  });
}

function haversineKm(aLat, aLon, bLat, bLon) {
  var r = 6371;
  var dLat = ((bLat - aLat) * Math.PI) / 180;
  var dLon = ((bLon - aLon) * Math.PI) / 180;
  var lat1 = (aLat * Math.PI) / 180;
  var lat2 = (bLat * Math.PI) / 180;
  var h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * r * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function closestLeaf(node, lat, lon) {
  var best = null;
  function visit(n) {
    var kids = n.children || [];
    if (!kids.length) {
      if (typeof n.lat === "number" && typeof n.lon === "number") {
        var km = haversineKm(lat, lon, n.lat, n.lon);
        if (!best || km < best.km) best = { node: n, km: km };
      }
      return;
    }
    kids.forEach(visit);
  }
  visit(node);
  return best;
}

function findIndexed(node) {
  for (var i = 0; i < index.length; i++) {
    if (index[i].node === node) return index[i];
  }
  return null;
}

function ringContains(ring, lon, lat) {
  var inside = false;
  for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    var yi = ring[i][1],
      yj = ring[j][1];
    var xi = ring[i][0],
      xj = ring[j][0];
    var intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function polygonContains(polygon, lon, lat) {
  if (!ringContains(polygon[0], lon, lat)) return false;
  for (var h = 1; h < polygon.length; h++) {
    if (ringContains(polygon[h], lon, lat)) return false;
  }
  return true;
}

function featureContains(feature, lon, lat) {
  var g = feature.geometry;
  if (!g) return false;
  if (g.type === "Polygon") return polygonContains(g.coordinates, lon, lat);
  if (g.type === "MultiPolygon") {
    for (var i = 0; i < g.coordinates.length; i++) {
      if (polygonContains(g.coordinates[i], lon, lat)) return true;
    }
  }
  return false;
}

document.addEventListener("alpine:init", function () {
  Alpine.data("regionApp", function () {
    return {
      tree: null,
      statesGeo: null,
      path: [],
      selectedCodes: [],
      enabledTags: [],
      mapNote: "",
      loadError: "",
      copyLabel: "Copy",
      map: null,
      pinLayer: null,
      stateLayer: null,
      dotLayer: null,
      keepPin: false,
      preserveMapView: false,

      get hasSelection() {
        return this.path.length > 0;
      },

      get limits() {
        return (this.tree && this.tree.limits) || {};
      },

      get badgeList() {
        return this.badgeNodes();
      },

      get command() {
        if (!this.path.length || !this.tree) {
          return { defText: "", blocked: false, defTooLong: false, tooMany: false };
        }
        var node = this.path[this.path.length - 1];
        var primary = node.code;
        var countyParent =
          isLeaf(node) && this.path.length >= 2
            ? this.path[this.path.length - 2].code
            : node.code;
        var extras = this.selectedCodes
          .filter(function (code) {
            return code !== primary;
          })
          .map(function (code) {
            return { code: code, parent: countyParent };
          });
        return RegionCommands.build(
          this.rootCodes(),
          this.path,
          this.defaultTags(this.path).concat(this.enabledTags),
          this.limits,
          extras,
        );
      },

      rootCodes() {
        return (this.tree.root || []).map(function (r) {
          return r.code;
        });
      },

      tagByCode(code) {
        var tags = (this.tree && this.tree.tags) || [];
        for (var i = 0; i < tags.length; i++) {
          if (tags[i].code === code) return tags[i];
        }
        return null;
      },

      defaultTags(pathNodes) {
        var self = this;
        return RegionCommands.inheritedTags(pathNodes).filter(function (code) {
          var tag = self.tagByCode(code);
          return !(tag && tag.optional);
        });
      },

      slugFamilyParent() {
        if (!this.path.length) return null;
        var node = this.path[this.path.length - 1];
        if (isLeaf(node) && this.path.length >= 2) return this.path[this.path.length - 2];
        return node;
      },

      badgeNodes() {
        var parent = this.slugFamilyParent();
        return parent ? parent.children || [] : [];
      },

      selectedNodes() {
        var out = [];
        var codes = this.selectedCodes;
        this.badgeNodes().forEach(function (n) {
          if (codes.indexOf(n.code) !== -1) out.push(n);
        });
        return out;
      },

      isSelected(code) {
        return this.selectedCodes.indexOf(code) !== -1;
      },

      selectPath(next, add) {
        var node = next.length ? next[next.length - 1] : null;
        this.path = next.slice();
        this.enabledTags = [];
        if (!add || !isLeaf(node)) {
          this.selectedCodes = isLeaf(node) ? [node.code] : [];
        } else {
          var parent = next.length >= 2 ? next[next.length - 2] : null;
          var family = parent
            ? (parent.children || []).map(function (c) {
                return c.code;
              })
            : [];
          var stays = this.selectedCodes.filter(function (code) {
            return family.indexOf(code) !== -1;
          });
          if (stays.indexOf(node.code) === -1) stays.push(node.code);
          this.selectedCodes = stays.slice();
        }
        this.focusSelection();
      },

      toggleSlug(code) {
        var parent = this.slugFamilyParent();
        if (!parent) return;
        var node = null;
        (parent.children || []).forEach(function (c) {
          if (c.code === code) node = c;
        });
        if (!node || !isLeaf(node)) return;
        var idx = this.selectedCodes.indexOf(code);
        if (idx === -1) {
          this.selectedCodes = this.selectedCodes.concat([code]);
          var found = findIndexed(node);
          if (found) this.path = found.path.slice();
        } else {
          var next = this.selectedCodes.slice();
          next.splice(idx, 1);
          this.selectedCodes = next;
          if (this.path[this.path.length - 1].code === code) {
            if (this.selectedCodes.length) {
              var fallback = null;
              var self = this;
              (parent.children || []).forEach(function (c) {
                if (self.selectedCodes.indexOf(c.code) !== -1) fallback = c;
              });
              if (fallback) {
                var hit = findIndexed(fallback);
                if (hit) this.path = hit.path.slice();
              }
            } else if (isLeaf(this.path[this.path.length - 1])) {
              this.path = this.path.slice(0, -1);
            }
          }
        }
        this.focusSelection();
      },

      toggleSlugKeepView(code) {
        this.preserveMapView = true;
        this.toggleSlug(code);
        this.preserveMapView = false;
        this.mapNote = "";
      },

      copyCommand() {
        var text = this.command.defText;
        var self = this;
        navigator.clipboard.writeText(text).then(function () {
          self.copyLabel = "Copied";
          setTimeout(function () {
            self.copyLabel = "Copy";
          }, 1200);
        });
      },

      stateAt(lat, lon) {
        var features = (this.statesGeo && this.statesGeo.features) || [];
        for (var i = 0; i < features.length; i++) {
          if (featureContains(features[i], lon, lat)) return features[i];
        }
        return null;
      },

      focusSelection() {
        if (!this.map) return;
        var node = this.path.length ? this.path[this.path.length - 1] : null;
        if (this.stateLayer) {
          this.map.removeLayer(this.stateLayer);
          this.stateLayer = null;
        }
        if (this.dotLayer) {
          this.map.removeLayer(this.dotLayer);
          this.dotLayer = null;
        }
        if (!node) {
          if (!this.keepPin && this.pinLayer) {
            this.map.removeLayer(this.pinLayer);
            this.pinLayer = null;
          }
          this.map.setView([39.5, -96], 4);
          return;
        }
        var feature = null;
        var features = (this.statesGeo && this.statesGeo.features) || [];
        for (var p = 0; p < this.path.length && !feature; p++) {
          for (var i = 0; i < features.length; i++) {
            if (features[i].properties.name === this.path[p].name) {
              feature = features[i];
              break;
            }
          }
        }
        if (feature) {
          this.stateLayer = L.geoJSON(feature, {
            style: { color: "#1f6b45", weight: 2, fillOpacity: 0.12 },
          }).addTo(this.map);
        }
        var self = this;
        var dots = [];
        this.selectedNodes().forEach(function (n) {
          if (typeof n.lat !== "number" || typeof n.lon !== "number") return;
          var current =
            self.path[self.path.length - 1] &&
            n.code === self.path[self.path.length - 1].code;
          var marker = L.circleMarker([n.lat, n.lon], {
            radius: current ? 8 : 6,
            color: "#145c32",
            weight: 2,
            fillColor: "#1f6b45",
            fillOpacity: 0.95,
          });
          marker.bindTooltip(n.code, { permanent: false });
          (function (leafCode) {
            marker.on("click", function (ev) {
              L.DomEvent.stopPropagation(ev);
              self.toggleSlugKeepView(leafCode);
            });
          })(n.code);
          dots.push(marker);
        });
        if (dots.length) {
          this.dotLayer = L.layerGroup(dots).addTo(this.map);
        }
        if (this.preserveMapView) return;
        var latlngs = dots.map(function (marker) {
          return marker.getLatLng();
        });
        if (this.keepPin && this.pinLayer) latlngs.push(this.pinLayer.getLatLng());
        if (this.keepPin && latlngs.length > 1) {
          this.map.fitBounds(L.latLngBounds(latlngs).pad(0.35));
          return;
        }
        if (this.keepPin && latlngs.length === 1) {
          this.map.setView(latlngs[0], 8);
          return;
        }
        if (!this.keepPin && this.pinLayer) {
          this.map.removeLayer(this.pinLayer);
          this.pinLayer = null;
        }
        if (!this.keepPin && this.path.length === 1 && this.stateLayer) {
          this.map.fitBounds(this.stateLayer.getBounds(), { padding: [20, 20] });
        }
        if (!this.keepPin && dots.length) {
          this.map.setView(dots[0].getLatLng(), 8);
        }
      },

      onMapClick(lat, lon) {
        if (this.pinLayer) this.map.removeLayer(this.pinLayer);
        this.pinLayer = L.marker([lat, lon]).addTo(this.map);
        var feature = this.stateAt(lat, lon);
        if (!feature) {
          this.mapNote = "That point is not inside a state on this map.";
          return;
        }
        var stateNode = byName[feature.properties.name];
        if (!stateNode) {
          this.mapNote =
            feature.properties.name + " has no slot in this tree.";
          return;
        }
        var hit = closestLeaf(stateNode, lat, lon);
        var target = hit ? hit.node : stateNode;
        var found = findIndexed(target);
        this.keepPin = true;
        if (found) this.selectPath(found.path, true);
        this.keepPin = false;
        this.mapNote = "";
      },

      initMap() {
        this.map = L.map("map", { scrollWheelZoom: true }).setView([39.5, -96], 4);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 12,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(this.map);
        var self = this;
        this.map.on("click", function (ev) {
          self.onMapClick(ev.latlng.lat, ev.latlng.lng);
        });
      },

      boot() {
        var self = this;
        Promise.all([
          fetch("data/regions.json").then(function (r) {
            if (!r.ok) throw new Error("regions.json");
            return r.json();
          }),
          fetch("data/us-states.geojson").then(function (r) {
            if (!r.ok) throw new Error("us-states.geojson");
            return r.json();
          }),
        ])
          .then(function (pair) {
            index = [];
            byName = {};
            self.tree = pair[0];
            self.statesGeo = pair[1];
            walk(self.tree.places || [], []);
            self.initMap();
          })
          .catch(function (err) {
            self.loadError =
              "Could not load the region data (" +
              err +
              "). From this directory run: python3 -m http.server 8765";
          });
      },
    };
  });
});
