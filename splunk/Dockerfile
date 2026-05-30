FROM splunk/splunk:9.3.1

# Copy configs into the image with splunk:splunk ownership so Ansible's
# "Update Splunk directory owner" task never needs to chown bind-mounted files
# (which fails with rootless Podman on WSL2).
COPY --chown=splunk:splunk indexes.conf /opt/splunk/etc/system/local/indexes.conf
COPY --chown=splunk:splunk props.conf   /opt/splunk/etc/system/local/props.conf
COPY --chown=splunk:splunk default.yml  /tmp/defaults/default.yml
