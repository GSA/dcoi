function handleSubmit(e) {
  e.preventDefault();

  clearMsg();

  if($('#input-file').val()) {
    parse();
  }
}


var headers = [];
var errorCount = 0;
var warningCount = 0;
var recordCount = 0;

var validValues = {
  "record validity": ['invalid facility', 'valid facility'],
  "ownership type": ['agency owned', 'colocation', 'outsourcing', 'using cloud provider'],
  "inter-agency shared services position": ['provider', 'tenant', 'none'],
  "country": ['u.s.', 'outside u.s.'],
  "data center tier": ['non-tiered', 'tier 1', 'tier 2', 'tier 3', 'tier 4', 'unknown', 'using cloud provider'],
  "key mission facility": ['yes', 'no'],
  "key mission facility type": ['mission', 'processing', 'control', 'location', 'legal', 'other'],
  "electricity is metered": ['yes', 'no'],
  "closing quarter": ['q1', 'q2', 'q3', 'q4'],
  "closing stage": ['closed', 'migration execution', 'not closing'],
};

var validTiers = ['tier 1', 'tier 2', 'tier 3', 'tier 4'];

var requiredFields = {
  valid: [
    'agency abbreviation', 'component', 'record validity', /*'data center name',*/
    'ownership type', 'gross floor area', 'data center tier', 'key mission facility', 'electricity is metered',
    'underutilized servers', 'actual hours of facility downtime', 'planned hours of facility availability',
    'rack count', 'total mainframes', 'total hpc cluster nodes', 'total virtual hosts', 'closing stage',
  ],
  closed: [
    'agency abbreviation', 'component', 'record validity', /*'data center name',*/
    'ownership type', 'gross floor area', 'data center tier', 'rack count', 'total mainframes',
    'total hpc cluster nodes', 'total virtual hosts', 'closing stage'
  ],
  invalid: ['agency abbreviation', 'component', 'data center id', 'record validity'],
  otherOwner: ['agency abbreviation', 'component', 'data center id', 'record validity', 'closing stage'],
  tenant: ['agency abbreviation', 'component', 'data center id', 'record validity', 'closing stage', 'ownership type'],
  kmf: ['agency abbreviation', 'component', 'data center id', 'record validity', 'closing stage', 'ownership type', 'key mission facility type']
};

function buildMsg(msg, indent) {
  let elm = $('<div class="message">'+msg+'</div>');
  if(indent) {
    elm.addClass('indent-'+indent);
  }
  return elm;
}

function showBlock(elms, classes) {
  let container = $('<div class="record"></div>');
  if(classes) {
    for(let i = 0; i < classes.length; i++) {
      container.addClass(classes[i]);
    }
  }

  for(let i = 0; i < elms.length; i++) {
    console.log(elms[i]);
    container.append(elms[i]);
  }
  $('#results').append(container);
}

function buildDivider() {
  return $('<hr class="row-divider"/>');
}

function clearMsg() {
  $('#results').empty();
}

function isValid(field) {
  if(typeof field != 'undefined' && field.length != 0) {
    return true;
  }
  return false;
}

function processRow(row) {
  let parsed = {};
  // An error in PapaParse is preventing proper parsing of header rows. Instead
  // of header: true in the config, we must use the following workaround.
  if(!headers.length) {
    headers = row.data;
    return;
  }
  else {
    // 'greedy' option for skipEmptyLines is also broken; workaround:
    if(!row.data || row.data.join('').trim().length == 0) {
      return;
    }

    for(let i = 0; i < headers.length; i++) {
      parsed[headers[i].toLowerCase()] = row.data[i];
    }
  }

  recordCount++;
  let results = checkErrors(parsed);
  if(results.errors.length || results.warnings.length) {
    showErrors(parsed, results.errors, results.warnings);
  }
}

function checkErrors(data) {
  let warnings = [];
  let errors = [];

  /*
   * Error checking.
   */

  // Check that required fields are filled out.
  let required = requiredFields['valid'];
  // Override the default required fields for special categories.

  // Invalid records are generally bad data so we relax our data checks.
  if(data['record validity'].toLowerCase() == 'invalid facility') {
    required = requiredFields['invalid'];
  }
  // Facilities not owned by the agency are not required to report most metrics.
  else if(data['ownership type'].toLowerCase() != 'agency owned') {
    required = requiredFields['otherOwner'];
  }
  // Tenants also do not need to report most metrics.
  else if(data['inter-agency shared services position'].toLowerCase() == 'tenant') {
    required = requiredFields['tenant'];
  }
  // Key mission facilities have reduced requirements.
  else if(data['key mission facility'].toLowerCase() == 'yes') {
    required = requiredFields['kmf'];
  }
  // Closed facilities may be older records and thus missing recent metrics.
  else if(data['closing stage'].toLowerCase() == 'closed') {
      required = requiredFields['closed'];
  }

  for(let i = 0; i < required.length; i++) {
    if( typeof data[required[i]] == 'undefined' || data[required[i]].trim().length == 0 ) {
      errors.push('The field "' + required[i] + '" must be filled in.');
    }
  }

  /*
   * If the record is not valid, this is assumed to be bad data and we don't do any further error checks.
   */
  if(isValid(data['record validity']) && data['record validity'].toLowerCase() == 'invalid facility') {
    errorCount += errors.length;
    warningCount += warnings.length;

    return {
      errors: errors,
      warnings: warnings
    }
  }

  // Generic validation check
  let fields = Object.keys(validValues);
  for(let i = 0; i < fields.length; i++) {
    let field = fields[i];
    let values = validValues[field];

    if(isValid(data[field]) && values.indexOf(data[field].toLowerCase()) == -1) {
      errors.push('The value for "'+ field +'" is not valid, must be one of: "' + values.join('", "') + '". The value given was "' + data[field] + '".');
    }
  }

  // Cloud Provider
  if(data['ownership type'].toLowerCase() == 'using cloud provider' && data['data center tier'].toLowerCase() != 'using cloud provider') {
    errors.push('Data Center Tier must be "Using Cloud Provider" if Ownership Type is "Using Cloud Provider".');
  }

  // Shared Service
  if(data['ownership type'].toLowerCase() == 'colocation' && !isValid(data['inter-agency shared services position'])) {
    errors.push('Inter-Agency Shared Services Position must be filled in if Ownership Type is "Colocation".');
  }

  // KMFs
  if(isValid(data['key mission facility']) && data['key mission facility'].toLowerCase() == 'yes') {
    if(!isValid(data['key mission facility type'])) {
      errors.push('Key Mission Facilities must have a Key Mission Facility Type.');
    }
  }

  // Closing Stage
  if(isValid(data['closing stage']) &&
      ['closed', 'migration execution'].indexOf(data['closing stage'].toLowerCase()) > -1) {

    if(!isValid(data['closing quarter']) || !isValid(data['closing fiscal year'])) {
       errors.push('If a facility has a closing stage of "Closed" or "Migration Execution", both Closing Year and Closing Quarter must be filled in.');
    }

  }

  /*
   * Data validation rules. This should catch any bad data. (warnings)
   */

  // Electricity
  if(isValid(data['electricity is metered']) && data['electricity is metered'].toLowerCase() == 'yes') {
    if(!isValid(data['avg electricity usage']) || !isValid(data['avg it electricity usage'])) {
      warnings.push('If Electricity is Metered equals "Yes", both Avg Electricity Usage and Avg IT Electricity Usage should be filled in.');
    }
    else if(parseFloat(data['avg electricity usage']) <= parseFloat(data['avg it electricity usage'])) {
      warnings.push('Avg Electricity Usage should be greater than Avg IT Electricity Usage');
    }

  }

  // KMFs
  if(isValid(data['key mission facility type']) && isValid(data['key mission facility']) &&
      data['key mission facility'].toLowerCase() != 'yes') {
    warnings.push('Key Mission Facility Type should only be present if Key Mission Facility is "Yes".');
  }

  if(isValid(data['key mission facility']) && data['key mission facility'].toLowerCase() == 'yes') {
    if(isValid(data['data center tier']) &&
        validTiers.indexOf(data['data center tier'].toLowerCase()) == -1) {
      warnings.push('Non-tiered data centers should not be Key Mission Facilities. Key Mission Facilities should be Tier 1, Tier 2, Tier 3, or Tier 4 for Data Center Tier.');
    }

    if(isValid(data['ownership type']) && data['ownership type'].toLowerCase() != 'agency owned') {
      warnings.push('Key Mission Facilities should be "Agency Owned" for Ownership Type.');
    }

    if(isValid(data['closing stage']) && data['closing stage'].toLowerCase() != 'not closing') {
      warnings.push('Key Mission Facilities should be "Not Closing" for Closing Stage.');
    }
  }

  errorCount += errors.length;
  warningCount += warnings.length;

  return {
    errors: errors,
    warnings: warnings
  }
}

function showErrors(data, errors, warnings) {
  let msgs = [];
  let classes = [];
  msgs.push(
    buildMsg(data['data center id'] + ' | ' + data['component'] + ' | ' + data['data center name'])
  );
  if(errors.length) {
    classes.push('has-errors');
    msgs = msgs.concat(showCategory('Errors', errors));
  }
  if(warnings.length) {
    classes.push('has-warnings');
    msgs = msgs.concat(showCategory('Warnings', warnings));
  }
  msgs.push(buildDivider());
  showBlock(msgs, classes);
}

function showCategory(label, errors) {
  let msgs = [];
  if(errors.length) {
    msgs.push(buildMsg(label+':', 1));
    for(let i = 0; i < errors.length; i++) {
      msgs.push(buildMsg(errors[i], 2));
    }
  }
  return msgs;
}

function parseDone() {
  msgs = [
    buildMsg('Inventory validation complete.'),
    buildMsg(recordCount + ' records processed.'),
    buildMsg('')
  ]
  if(errorCount > 0) {
    msgs.push(
      buildMsg('<strong class="error">' + errorCount + ' errors were found.  You must resolved these errors before submitting your inventory data!</strong>')
    )
    msgs.push(buildMsg(''));
  }
  else {
    msgs.push(
      showMsg('<strong class="success">No critical errors were found. You may submit your inventory data.<strong>')
    );
    msgs.push(buildMsg(''));
  }
  if(warningCount > 0) {
    msgs.push(
      buildMsg(warningCount + ' warnings were found.  You do not have to resolve these warning before submitting your inventory data, but it is strongly suggested that you investigate them.')
    );
  }
  showBlock(msgs);
}

function parse() {
  headers = [];
  errorCount = 0;
  warningCount = 0;
  recordCount = 0;

  let papaConfig = {
    step: processRow,
    complete: parseDone
  };
  $('#input-file').parse({config: papaConfig});
}

function handleWarningDisplay() {
  $('#results').toggleClass('hide-warnings', !$('#toggle-warnings').prop('checked'));
}

$( document ).ready(function (){
  $('#submit').click(handleSubmit);
  $('#validate-form').submit(handleSubmit);
  $('#toggle-warnings').click(handleWarningDisplay);
});