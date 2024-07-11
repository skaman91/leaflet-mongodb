
L.DivIcon.SVGIcon = L.DivIcon.extend({
  options: {
    "className": "svg-icon",
    "circleAnchor": null, //defaults to [iconSize.x/2, iconSize.x/2]
    "circleColor": null, //defaults to color
    "circleFillColor": "rgb(255,255,255)",
    "circleFillOpacity": null, //default to opacity
    "circleImageAnchor": null, //defaults to [(iconSize.x - circleImageSize.x)/2, (iconSize.x - circleImageSize.x)/2]
    "circleImagePath": null, //no default, preference over circleText
    "circleImageSize": null, //defaults to [iconSize.x/4, iconSize.x/4] if circleImage is supplied
    "circleOpacity": null, // defaults to opacity
    "circleRatio": 0.5,
    "circleText": "",
    "circleWeight": null, //defaults to weight
    "color": "rgb(0,102,255)",
    "fillColor": null, // defaults to color
    "fillOpacity": 0.4,
    "fontColor": "rgb(0, 0, 0)",
    "fontOpacity": "1",
    "fontSize": null, // defaults to iconSize.x/4
    "fontWeight": "normal",
    "iconAnchor": null, //defaults to [iconSize.x/2, iconSize.y] (point tip)
    "iconSize": L.point(32,48),
    "opacity": 1,
    "popupAnchor": null,
    "shadowAngle": 45,
    "shadowBlur": 1,
    "shadowColor": "rgb(0,0,10)",
    "shadowEnable": false,
    "shadowLength": .75,
    "shadowOpacity": 0.5,
    "shadowTranslate": L.point(0,0),
    "weight": 2
  },
  initialize: function(options) {
    options = L.Util.setOptions(this, options)

    //iconSize needs to be converted to a Point object if it is not passed as one
    options.iconSize = L.point(options.iconSize)

    //in addition to setting option dependant defaults, Point-based options are converted to Point objects
    if (!options.circleAnchor) {
      options.circleAnchor = L.point(Number(options.iconSize.x)/2, Number(options.iconSize.x)/2)
    }
    else {
      options.circleAnchor = L.point(options.circleAnchor)
    }
    if (!options.circleColor) {
      options.circleColor = options.color
    }
    if (!options.circleFillOpacity) {
      options.circleFillOpacity = options.opacity
    }
    if (!options.circleOpacity) {
      options.circleOpacity = options.opacity
    }
    if (!options.circleWeight) {
      options.circleWeight = options.weight
    }
    if (!options.fillColor) {
      options.fillColor = options.color
    }
    if (!options.fontSize) {
      options.fontSize = Number(options.iconSize.x/4)
    }
    if (!options.iconAnchor) {
      options.iconAnchor = L.point(Number(options.iconSize.x)/2, Number(options.iconSize.y))
    }
    else {
      options.iconAnchor = L.point(options.iconAnchor)
    }
    if (!options.popupAnchor) {
      options.popupAnchor = L.point(0, (-0.75)*(options.iconSize.y))
    }
    else {
      options.popupAnchor = L.point(options.popupAnchor)
    }
    if (options.circleImagePath && !options.circleImageSize) {
      options.circleImageSize = L.point(Number(options.iconSize.x)/4, Number(options.iconSize.x)/4)
    }
    else {
      options.circleImageSize = L.point(options.circleImageSize)
    }
    if (options.circleImagePath && !options.circleImageAnchor) {
      options.circleImageAnchor = L.point(
        (Number(options.iconSize.x) - Number(options.circleImageSize.x))/2,
        (Number(options.iconSize.x) - Number(options.circleImageSize.y))/2
      )
    }
    else {
      options.circleImageAnchor = L.point(options.circleImageAnchor)
    }

    options.html = this._createSVG()
  },
  _createCircle: function() {
    const cx = Number(this.options.circleAnchor.x)
    const cy = Number(this.options.circleAnchor.y)
    const radius = this.options.iconSize.x/2 * Number(this.options.circleRatio)
    const fill = this.options.circleFillColor
    const fillOpacity = this.options.circleFillOpacity
    const stroke = this.options.circleColor
    const strokeOpacity = this.options.circleOpacity
    const strokeWidth = this.options.circleWeight
    const className = this.options.className + "-circle"

    return '<circle class="' + className + '" cx="' + cx + '" cy="' + cy + '" r="' + radius +
      '" fill="' + fill + '" fill-opacity="' + fillOpacity +
      '" stroke="' + stroke + '" stroke-opacity=' + strokeOpacity + '" stroke-width="' + strokeWidth + '"/>'
  },
  _createCircleImage: function() {
    let x = this.options.circleImageAnchor.x
    let y = this.options.circleImageAnchor.y
    let height = this.options.circleImageSize.y
    let width = this.options.circleImageSize.x
    let href = this.options.circleImagePath

    return '<image x="' + x + '" y="' + y + '" height="' + height + '" width="' + width + '" href="' + href + '"</image>'
  },
  _createPathDescription: function() {
    const height = Number(this.options.iconSize.y)
    const width = Number(this.options.iconSize.x)
    const weight = Number(this.options.weight)
    const margin = weight / 2

    const startPoint = "M " + margin + " " + (width/2) + " "
    const leftLine = "L " + (width/2) + " " + (height - weight) + " "
    const rightLine = "L " + (width - margin) + " " + (width/2) + " "
    const arc = "A " + (width/4) + " " + (width/4) + " 0 0 0 " + margin + " " + (width/2) + " Z"

    return startPoint + leftLine + rightLine + arc
  },
  _createPath: function() {
    const pathDescription = this._createPathDescription()
    const strokeWidth = this.options.weight
    const stroke = this.options.color
    const strokeOpacity = this.options.opacity
    const fill = this.options.fillColor
    const fillOpacity = this.options.fillOpacity
    const className = this.options.className + "-path"

    return '<path class="' + className + '" d="' + pathDescription +
      '" stroke-width="' + strokeWidth + '" stroke="' + stroke + '" stroke-opacity="' + strokeOpacity +
      '" fill="' + fill + '" fill-opacity="' + fillOpacity + '"/>'
  },
  _createShadow: function() {
    const pathDescription = this._createPathDescription()
    const strokeWidth = this.options.weight
    const stroke = this.options.shadowColor
    const fill = this.options.shadowColor
    const className = this.options.className + "-shadow"

    const origin = (this.options.iconSize.x / 2) + "px " + (this.options.iconSize.y) + "px"
    const rotation = this.options.shadowAngle
    const height = this.options.shadowLength
    const opacity = this.options.shadowOpacity
    const blur = this.options.shadowBlur
    const translate = this.options.shadowTranslate.x + "px, " + this.options.shadowTranslate.y + "px"

    const blurFilter = "<filter id='iconShadowBlur'><feGaussianBlur in='SourceGraphic' stdDeviation='" + blur + "'/></filter>"

    const shadow = '<path filter="url(#iconShadowBlur") class="' + className + '" d="' + pathDescription +
      '" fill="' + fill + '" stroke-width="' + strokeWidth + '" stroke="' + stroke +
      '" style="opacity: ' + opacity + '; ' + 'transform-origin: ' + origin +'; transform: rotate(' + rotation + 'deg) translate(' + translate + ') scale(1, '+ height +')' +
      '"/>'

    return blurFilter+shadow
  },
  _createSVG: function() {
    const path = this._createPath()
    const circle = this._createCircle()
    const shadow = this.options.shadowEnable ? this._createShadow() : ""
    const innerCircle = this.options.circleImagePath ? this._createCircleImage() : this._createText()
    const className = this.options.className + "-svg"
    let width = this.options.iconSize.x
    let height = this.options.iconSize.y

    if (this.options.shadowEnable) {
      width += this.options.iconSize.y * this.options.shadowLength - (this.options.iconSize.x / 2)
      width = Math.max(width, 32)
      height += this.options.iconSize.y * this.options.shadowLength
    }

    const style = "width:" + width + "px; height:" + height

    return '<svg xmlns="http://www.w3.org/2000/svg" version="1.1" class="' + className + '" style="' + style + '">' + shadow + path + circle + innerCircle + '</svg>'
  },
  _createText: function() {
    const fontSize = this.options.fontSize + "px"
    const fontWeight = this.options.fontWeight
    const lineHeight = Number(this.options.fontSize)

    const x = this.options.circleAnchor.x
    const y = this.options.circleAnchor.y + (lineHeight * 0.35) //35% was found experimentally
    const circleText = this.options.circleText
    const textColor = this.options.fontColor.replace("rgb(", "rgba(").replace(")", "," + this.options.fontOpacity + ")")

    return '<text text-anchor="middle" x="' + x + '" y="' + y + '" style="font-size: ' + fontSize + '; font-weight: ' + fontWeight + '" fill="' + textColor + '">' + circleText + '</text>'
  }
})

L.divIcon.svgIcon = function(options) {
  return new L.DivIcon.SVGIcon(options)
}

L.Marker.SVGMarker = L.Marker.extend({
  options: {
    "iconFactory": L.divIcon.svgIcon,
    "iconOptions": {}
  },
  initialize: function(latlng, options) {
    options = L.Util.setOptions(this, options)
    options.icon = options.iconFactory(options.iconOptions)
    this._latlng = latlng
  },
  onAdd: function(map) {
    L.Marker.prototype.onAdd.call(this, map)
  },
  setStyle: function(style) {
    if (this._icon) {
      const svg = this._icon.children[0]
      const iconBody = this._icon.children[0].children[0]
      const iconCircle = this._icon.children[0].children[1]

      if (style.color && !style.iconOptions) {
        const stroke = style.color.replace("rgb","rgba").replace(")", ","+this.options.icon.options.opacity+")")
        const fill = style.color.replace("rgb","rgba").replace(")", ","+this.options.icon.options.fillOpacity+")")
        iconBody.setAttribute("stroke", stroke)
        iconBody.setAttribute("fill", fill)
        iconCircle.setAttribute("stroke", stroke)

        this.options.icon.fillColor = fill
        this.options.icon.color = stroke
        this.options.icon.circleColor = stroke
      }
      if (style.opacity) {
        this.setOpacity(style.opacity)
      }
      if (style.iconOptions) {
        if (style.color) { style.iconOptions.color = style.color }
        const iconOptions = L.Util.setOptions(this.options.icon, style.iconOptions)
        this.setIcon(L.divIcon.svgIcon(iconOptions))
      }
    }
  }
})

L.marker.svgMarker = function(latlng, options) {
  return new L.Marker.SVGMarker(latlng, options)
}